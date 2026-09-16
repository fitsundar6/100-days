import { Router, Response } from 'express';
import { requireAdminAuth, AuthenticatedRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { inMemoryRegisteredClients } from './registration';

const router = Router();

// ============================================================
// 1. DASHBOARD OVERVIEW & COMPREHENSIVE KPIS
// ============================================================
router.get('/dashboard-stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 1. Total & Active Clients
    const totalClients = await prisma.client.count();
    const activeClients = await prisma.client.count({
      where: { status: 'active' },
    });

    // 2. Completed Today (completions today)
    const completedToday = await prisma.workoutCompletion.count({
      where: {
        status: 'completed',
        completedAt: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    // 3. Incomplete Today
    const incompleteToday = Math.max(0, activeClients - completedToday);

    // 4. Average Workout Duration (in minutes)
    const completionsWithDuration = await prisma.workoutCompletion.findMany({
      where: {
        status: 'completed',
        durationSeconds: { not: null },
      },
      select: { durationSeconds: true },
    });

    const avgDurationSeconds =
      completionsWithDuration.length > 0
        ? completionsWithDuration.reduce((acc, c) => acc + (c.durationSeconds || 0), 0) / completionsWithDuration.length
        : 2200; // default ~36 mins

    const avgDurationMinutes = Math.round(avgDurationSeconds / 60);

    // 5. Challenge Completion % across all participants
    const totalCompletions = await prisma.workoutCompletion.count({
      where: { status: 'completed' },
    });
    const totalPossibleDays = Math.max(1, activeClients * 100);
    const challengeCompletionPct = Math.min(100, Math.round((totalCompletions / totalPossibleDays) * 100));

    // 6. Active Challenge details
    const activeChallenge = await prisma.challenge.findFirst({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { participants: true, workoutDays: true },
        },
      },
    });

    return res.json({
      success: true,
      stats: {
        totalClients,
        activeClients,
        completedToday,
        incompleteToday,
        avgDurationMinutes,
        avgDurationSeconds: Math.round(avgDurationSeconds),
        challengeCompletionPct,
        activeChallenge: activeChallenge
          ? {
              id: activeChallenge.id,
              name: activeChallenge.name,
              totalDays: activeChallenge.totalDays,
              startDate: activeChallenge.startDate,
              endDate: activeChallenge.endDate,
              participantCount: activeChallenge._count.participants,
            }
          : null,
      },
    });
  } catch (error: any) {
    console.error('Error fetching dashboard stats:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve dashboard analytics' });
  }
});

// ============================================================
// 2. CLIENTS DIRECTORY & 100-DAY TRACKING PROGRESS
// ============================================================

/**
 * GET /api/admin/clients
 * Returns clients with startingWeight, currentWeight, weightChange,
 * daysCompleted, daysIncomplete, completionPct, avgDuration, lastWorkout
 */
router.get('/clients', async (req: AuthenticatedRequest, res: Response) => {
  try {
    let clients: any[] = [];
    try {
      clients = await prisma.client.findMany({
        include: {
          challengeParticipants: {
            include: {
              completions: {
                where: { status: 'completed' },
                include: {
                  workoutDay: true,
                },
                orderBy: { completedAt: 'desc' },
              },
            },
          },
          weightLogs: {
            orderBy: { date: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (dbErr) {
      console.warn('DB clients query fallback to in-memory:', dbErr);
    }

    const clientSummaries = clients.map((c: any) => {
      // Find latest weight from logs or currentWeight or startingWeight
      const logs = c.weightLogs || [];
      const latestWeightLog = logs.length > 0 ? logs[logs.length - 1] : null;
      const currentWeight = latestWeightLog ? latestWeightLog.weight : c.currentWeight || c.startingWeight || 0;
      const startingWeight = c.startingWeight || currentWeight;
      const weightChange = startingWeight > 0 ? Number((currentWeight - startingWeight).toFixed(1)) : 0;

      // Aggregate completions across challenges
      const challengeParts = c.challengeParticipants || [];
      const allCompletions = challengeParts.flatMap((cp: any) => cp.completions || []);
      const daysCompleted = allCompletions.length;
      const totalDays = 100;
      const daysIncomplete = Math.max(0, totalDays - daysCompleted);
      const completionPct = Math.min(100, Math.round((daysCompleted / totalDays) * 100));

      // Avg duration
      const totalDuration = allCompletions.reduce((acc: number, comp: any) => acc + (comp.durationSeconds || 0), 0);
      const avgDurationSec = daysCompleted > 0 ? Math.round(totalDuration / daysCompleted) : 0;
      const avgDurationMins = Math.round(avgDurationSec / 60);

      // Last workout
      const lastCompletion = allCompletions[0];
      const lastWorkout = lastCompletion?.completedAt
        ? new Date(lastCompletion.completedAt).toISOString()
        : null;

      // Extract weekly weight progression array for 14 weeks
      const weeklyWeights: (number | null)[] = new Array(15).fill(null);
      weeklyWeights[0] = startingWeight;
      logs.forEach((log: any, idx: number) => {
        if (idx + 1 < 15) {
          weeklyWeights[idx + 1] = log.weight;
        }
      });

      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email || '',
        status: c.status,
        startingWeight,
        currentWeight,
        endingWeight: c.endingWeight || null,
        targetWeight: c.endingWeight || null,
        weightChange,
        daysCompleted,
        daysIncomplete,
        completionPct,
        avgDurationMinutes: avgDurationMins,
        lastWorkout,
        weeklyWeights,
        avatarUrl: c.avatarUrl || null,
        registeredAt: c.registeredAt || c.createdAt,
        formattedJoinedDate: (c.registeredAt || c.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        createdAt: c.createdAt,
      };
    });

    // Merge in-memory registered clients if not already in DB
    inMemoryRegisteredClients.forEach((memClient) => {
      if (!clientSummaries.some((c: any) => c.id === memClient.id || (memClient.email && c.email === memClient.email))) {
        const regDate = new Date(memClient.registeredAt || memClient.createdAt);
        clientSummaries.unshift({
          id: memClient.id,
          name: memClient.name,
          phone: memClient.phone,
          email: memClient.email || '',
          status: memClient.status,
          startingWeight: memClient.startingWeight,
          currentWeight: memClient.currentWeight,
          endingWeight: null,
          targetWeight: null,
          weightChange: 0,
          daysCompleted: 0,
          daysIncomplete: 100,
          completionPct: 0,
          avgDurationMinutes: 0,
          lastWorkout: null,
          weeklyWeights: [memClient.startingWeight],
          avatarUrl: memClient.avatarUrl || null,
          registeredAt: memClient.registeredAt || memClient.createdAt,
          formattedJoinedDate: regDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
          createdAt: memClient.createdAt,
        });
      }
    });

    console.log(`✅ Admin dashboard loaded ${clientSummaries.length} clients directly from PostgreSQL database.`);
    return res.json({ success: true, clients: clientSummaries });
  } catch (error: any) {
    console.error('❌ Error fetching clients from PostgreSQL:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve clients list from database' });
  }
});

/**
 * GET /api/admin/clients/:id
 * Detailed client profile + 100-day completion matrix (Day 1..100 ✓ / ✕)
 */
router.get('/clients/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);

    let client: any = null;
    try {
      client = await prisma.client.findUnique({
        where: { id },
        include: {
          challengeParticipants: {
            include: {
              challenge: true,
              completions: {
                include: {
                  workoutDay: true,
                  exerciseLogs: {
                    include: { exercise: true },
                  },
                },
              },
            },
          },
          weightLogs: {
            orderBy: { date: 'asc' },
          },
        },
      });
    } catch (dbErr) {
      console.warn('DB client query fallback to in-memory:', dbErr);
    }

    if (!client) {
      // Check in-memory fallback store
      const memClient = Array.from(inMemoryRegisteredClients.values()).find((c) => c.id === id);
      if (memClient) {
        return res.json({
          success: true,
          client: {
            id: memClient.id,
            name: memClient.name,
            phone: memClient.phone,
            email: memClient.email,
            avatarUrl: memClient.avatarUrl,
            startingWeight: memClient.startingWeight,
            currentWeight: memClient.currentWeight,
            endingWeight: null,
            status: memClient.status,
            weightChange: 0,
            registeredAt: memClient.registeredAt,
            formattedRegisteredAt: new Date(memClient.registeredAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
            weightLogs: [{ date: memClient.registeredAt, weight: memClient.startingWeight, note: 'Day 1 Benchmark' }],
            dayMatrix: Array.from({ length: 100 }, (_, i) => ({ dayNumber: i + 1, completed: false, details: null })),
            totalCompleted: 0,
            attendanceSummary: {
              presentDays: 0,
              absentDays: 0,
              totalAttendanceRecorded: 0,
              attendancePct: 100,
            },
          },
        });
      }
      return res.status(404).json({ success: false, error: 'Client not found' });
    }

    // Query client attendance records
    let attendances: any[] = [];
    try {
      attendances = await prisma.gymAttendance.findMany({
        where: { clientId: client.id },
        orderBy: { attendanceDate: 'desc' },
      });
    } catch (e) {}

    const presentDays = attendances.filter((a: any) => a.status === 'present').length;
    const absentDays = attendances.filter((a: any) => a.status === 'absent').length;
    const totalAttendanceRecorded = attendances.length;
    const attendancePct = totalAttendanceRecorded > 0 ? Math.round((presentDays / totalAttendanceRecorded) * 100) : 100;
    const startW = client.startingWeight || 0;
    const currW = client.currentWeight || startW;
    const weightChange = startW > 0 ? Number((currW - startW).toFixed(1)) : 0;

    // Build 100-day matrix
    const completedDayNumbers = new Set<number>();
    const completionMap: Record<number, any> = {};

    (client.challengeParticipants || []).forEach((cp: any) => {
      (cp.completions || []).forEach((comp: any) => {
        if (comp.status === 'completed' && comp.workoutDay) {
          completedDayNumbers.add(comp.workoutDay.dayNumber);
          completionMap[comp.workoutDay.dayNumber] = {
            completedAt: comp.completedAt,
            durationSeconds: comp.durationSeconds,
            exerciseLogsCount: (comp.exerciseLogs || []).length,
          };
        }
      });
    });

    const dayMatrix = [];
    for (let dayNum = 1; dayNum <= 100; dayNum++) {
      const isCompleted = completedDayNumbers.has(dayNum);
      dayMatrix.push({
        dayNumber: dayNum,
        completed: isCompleted,
        details: isCompleted ? completionMap[dayNum] : null,
      });
    }

    const regDate = client.registeredAt || client.createdAt;

    return res.json({
      success: true,
      client: {
        id: client.id,
        name: client.name,
        phone: client.phone,
        email: client.email,
        avatarUrl: client.avatarUrl,
        startingWeight: client.startingWeight,
        currentWeight: client.currentWeight,
        endingWeight: client.endingWeight,
        status: client.status,
        weightChange,
        registeredAt: regDate,
        formattedRegisteredAt: regDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        weightLogs: client.weightLogs,
        dayMatrix,
        totalCompleted: completedDayNumbers.size,
        attendanceSummary: {
          presentDays,
          absentDays,
          totalAttendanceRecorded,
          attendancePct,
        },
      },
    });
  } catch (error: any) {
    console.error('Error fetching client details:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve client details' });
  }
});

/**
 * GET /api/admin/notifications/registrations
 * Real-time endpoint for new client onboarding alert notifications
 */
router.get('/notifications/registrations', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sinceQuery = req.query.since ? new Date(String(req.query.since)) : new Date(Date.now() - 3600 * 1000);

    let recentClients: any[] = [];
    try {
      recentClients = await prisma.client.findMany({
        where: {
          registeredAt: { gte: sinceQuery },
          startingWeight: { not: null },
        },
        orderBy: { registeredAt: 'desc' },
        take: 10,
      });
    } catch (dbErr) {
      console.warn('DB notifications query error:', dbErr);
    }

    // Include recent in-memory clients
    inMemoryRegisteredClients.forEach((memClient) => {
      const regDate = new Date(memClient.registeredAt || memClient.createdAt);
      if (regDate >= sinceQuery && !recentClients.some((c) => c.googleId === memClient.googleId || c.id === memClient.id)) {
        recentClients.unshift(memClient);
      }
    });

    const formatted = recentClients.map((c: any) => {
      const d = new Date(c.registeredAt || c.createdAt);
      const timeStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
        ', ' +
        d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

      return {
        id: c.id,
        name: c.name,
        email: c.email,
        startingWeight: c.startingWeight,
        currentWeight: c.currentWeight,
        avatarUrl: c.avatarUrl,
        registeredAt: c.registeredAt || c.createdAt,
        formattedTime: timeStr,
      };
    });

    return res.json({ success: true, newRegistrations: formatted, notifications: formatted });
  } catch (error: any) {
    console.error('Error fetching registration notifications:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve registration notifications' });
  }
});

/**
 * POST /api/admin/clients
 * Creates new client and automatically enrolls in active challenge
 */
router.post('/clients', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, phone, email, startingWeight, targetWeight } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ success: false, error: 'Client name and phone number are required' });
    }

    const cleanPhone = String(phone).trim();
    const existing = await prisma.client.findUnique({
      where: { phone: cleanPhone },
    });

    if (existing) {
      return res.status(400).json({ success: false, error: 'Client with this phone number already exists' });
    }

    const parsedStartWeight = startingWeight ? parseFloat(startingWeight) : null;
    const parsedTargetWeight = targetWeight ? parseFloat(targetWeight) : null;

    const newClient = await prisma.client.create({
      data: {
        name: String(name).trim(),
        phone: cleanPhone,
        email: email ? String(email).trim().toLowerCase() : null,
        startingWeight: parsedStartWeight,
        currentWeight: parsedStartWeight,
        endingWeight: parsedTargetWeight,
        status: 'active',
      },
    });

    // Record initial weight log if starting weight provided
    if (parsedStartWeight) {
      await prisma.weightLog.create({
        data: {
          clientId: newClient.id,
          weight: parsedStartWeight,
          note: 'Starting body weight benchmark',
        },
      });
    }

    // Link to active challenge if one exists
    const activeChallenge = await prisma.challenge.findFirst({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
    });

    if (activeChallenge) {
      await prisma.challengeParticipant.create({
        data: {
          clientId: newClient.id,
          challengeId: activeChallenge.id,
          status: 'active',
        },
      });
    }

    console.log(`✅ Admin created new client in PostgreSQL: [${newClient.id}] ${newClient.name} (${newClient.phone})`);
    return res.status(201).json({ success: true, client: newClient });
  } catch (error: any) {
    console.error('❌ Error creating client in database:', error);
    return res.status(500).json({ success: false, error: 'Failed to create client record in database' });
  }
});

/**
 * PUT /api/admin/clients/:id
 * Updates client details
 */
router.put('/clients/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { name, phone, email, startingWeight, currentWeight, targetWeight, status } = req.body;

    const updated = await prisma.client.update({
      where: { id },
      data: {
        name: name ? String(name).trim() : undefined,
        phone: phone ? String(phone).trim() : undefined,
        email: email !== undefined ? (email ? String(email).trim().toLowerCase() : null) : undefined,
        startingWeight: startingWeight !== undefined ? (startingWeight ? parseFloat(startingWeight) : null) : undefined,
        currentWeight: currentWeight !== undefined ? (currentWeight ? parseFloat(currentWeight) : null) : undefined,
        endingWeight: targetWeight !== undefined ? (targetWeight ? parseFloat(targetWeight) : null) : undefined,
        status: status || undefined,
      },
    });

    console.log(`✅ Admin updated client in PostgreSQL: [${updated.id}] ${updated.name}`);
    return res.json({ success: true, client: updated });
  } catch (error: any) {
    console.error('❌ Error updating client in database:', error);
    return res.status(500).json({ success: false, error: 'Failed to update client in database' });
  }
});

/**
 * DELETE /api/admin/clients/:id
 * Deletes client
 */
router.delete('/clients/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    await prisma.client.delete({ where: { id } });
    console.log(`✅ Admin deleted client from PostgreSQL: [${id}]`);
    return res.json({ success: true, message: 'Client deleted successfully from database' });
  } catch (error: any) {
    console.error('❌ Error deleting client from database:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete client from database' });
  }
});

/**
 * POST /api/admin/clients/:id/weight
 * Appends a new weight log entry
 */
router.post('/clients/:id/weight', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { weight, date, note } = req.body;

    if (!weight) {
      return res.status(400).json({ success: false, error: 'Weight value is required' });
    }

    const parsedWeight = parseFloat(weight);
    const logDate = date ? new Date(date) : new Date();

    const weightLog = await prisma.weightLog.create({
      data: {
        clientId: id,
        weight: parsedWeight,
        date: logDate,
        note: note ? String(note).trim() : null,
      },
    });

    // Update currentWeight on client
    await prisma.client.update({
      where: { id },
      data: { currentWeight: parsedWeight },
    });

    console.log(`✅ Admin logged weight in PostgreSQL: Client [${id}], Weight: ${parsedWeight} kg`);
    return res.status(201).json({ success: true, weightLog });
  } catch (error: any) {
    console.error('❌ Error adding weight log in database:', error);
    return res.status(500).json({ success: false, error: 'Failed to save weight record to database' });
  }
});

// ============================================================
// 3. CHALLENGES MANAGEMENT
// ============================================================

/**
 * GET /api/admin/challenges
 * Lists all challenges with participant and completion counts
 */
router.get('/challenges', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const challenges = await prisma.challenge.findMany({
      include: {
        _count: {
          select: {
            participants: true,
            workoutDays: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate completion rates
    const challengeList = await Promise.all(
      challenges.map(async (c) => {
        const participantCount = c._count.participants;
        const totalCompletions = await prisma.workoutCompletion.count({
          where: {
            status: 'completed',
            workoutDay: { challengeId: c.id },
          },
        });

        const totalPossible = Math.max(1, participantCount * (c.totalDays || 100));
        const avgProgress = Math.min(100, Math.round((totalCompletions / totalPossible) * 100));

        return {
          id: c.id,
          title: c.name,
          name: c.name,
          description: c.description,
          image_url: c.imageUrl || 'images/gym-hero.jpg',
          imageUrl: c.imageUrl || 'images/gym-hero.jpg',
          start_date: c.startDate.toISOString().split('T')[0],
          end_date: c.endDate.toISOString().split('T')[0],
          total_days: c.totalDays,
          status: c.status,
          visibility: c.visibility || 'public',
          rules: c.rules || '',
          rewards: c.rewardSummary || '',
          participants_count: participantCount,
          completion_rate: avgProgress,
          created_at: c.createdAt.toISOString(),
        };
      })
    );

    return res.json({ success: true, challenges: challengeList });
  } catch (error: any) {
    console.error('Error fetching challenges:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve challenges' });
  }
});

/**
 * GET /api/admin/challenges/:id
 * Fetches single challenge details with participant count, total workouts, and completions
 */
router.get('/challenges/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const challenge: any = await prisma.challenge.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            participants: true,
            workoutDays: true,
          },
        },
      },
    });

    if (!challenge) {
      return res.status(404).json({ success: false, error: 'Challenge not found' });
    }

    const totalCompletions = await prisma.workoutCompletion.count({
      where: {
        status: 'completed',
        workoutDay: { challengeId: challenge.id },
      },
    });

    const participantCount = challenge._count.participants;
    const totalPossible = Math.max(1, participantCount * (challenge.totalDays || 100));
    const avgProgress = Math.min(100, Math.round((totalCompletions / totalPossible) * 100));

    return res.json({
      success: true,
      challenge: {
        id: challenge.id,
        title: challenge.name,
        name: challenge.name,
        description: challenge.description,
        image_url: challenge.imageUrl || 'images/gym-hero.jpg',
        imageUrl: challenge.imageUrl || 'images/gym-hero.jpg',
        start_date: challenge.startDate.toISOString().split('T')[0],
        end_date: challenge.endDate.toISOString().split('T')[0],
        total_days: challenge.totalDays,
        status: challenge.status,
        visibility: challenge.visibility || 'public',
        rules: challenge.rules || '',
        rewards: challenge.rewardSummary || '',
        participants_count: participantCount,
        completed_workouts: totalCompletions,
        completion_rate: avgProgress,
        created_at: challenge.createdAt.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error fetching challenge by ID:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve challenge details' });
  }
});

/**
 * POST /api/admin/challenges
 * Creates new challenge and automatically populates 100 workout days
 */
router.post('/challenges', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, name, description, start_date, startDate, end_date, endDate, total_days, totalDays, status, visibility, rules, rewards, rewardSummary, image_url, imageUrl } = req.body;

    const challengeName = title || name;
    const start = start_date || startDate;
    const end = end_date || endDate;
    const days = parseInt(total_days || totalDays, 10) || 100;
    const image = image_url || imageUrl || 'images/gym-hero.jpg';

    if (!challengeName || !start || !end) {
      return res.status(400).json({ success: false, error: 'Challenge name, start date, and end date are required' });
    }

    const newChallenge = await prisma.challenge.create({
      data: {
        name: challengeName.trim(),
        description: description ? description.trim() : null,
        imageUrl: image,
        startDate: new Date(start),
        endDate: new Date(end),
        totalDays: days,
        status: status || 'active',
        visibility: visibility || 'public',
        rules: rules ? rules.trim() : null,
        rewardSummary: rewards || rewardSummary ? String(rewards || rewardSummary).trim() : null,
        adminId: req.admin?.id || null,
      },
    });

    // Populate workout days Day 1 to Day N
    const defaultSplits = [
      { title: 'Chest & Triceps Hypertrophy', desc: 'Heavy barbell press, dumbbell flyes, and triceps isolation.' },
      { title: 'Back & Biceps Power', desc: 'Deadlifts, lat pulldowns, seated cable rows, and bicep curls.' },
      { title: 'Leg Hypertrophy & Calves', desc: 'Barbell back squats, Romanian deadlifts, lunges.' },
      { title: 'Shoulders & Core Armor', desc: 'Overhead barbell press, lateral raises, hollow holds.' },
      { title: 'Full Body Conditioning & HIIT', desc: 'Kettlebell swings, burpees, and functional agility.' },
      { title: 'Arm Farm & Core Stability', desc: 'Supersets for arms and core bracing.' },
      { title: 'Active Recovery & Mobility Flow', desc: 'Full-body mobility, stretching, and 10k steps.' },
    ];

    const daysPayload = [];
    const baseDate = new Date(start);
    for (let i = 1; i <= days; i++) {
      const split = defaultSplits[(i - 1) % defaultSplits.length];
      const dDate = new Date(baseDate);
      dDate.setDate(dDate.getDate() + (i - 1));

      daysPayload.push({
        challengeId: newChallenge.id,
        dayNumber: i,
        date: dDate,
        title: `Day ${i} — ${split.title}`,
        description: split.desc,
        reward: i % 7 === 0 ? `+${i * 5} Milestone Points` : '+10 Daily Points',
      });
    }

    await prisma.workoutDay.createMany({ data: daysPayload });

    return res.status(201).json({
      success: true,
      challenge: {
        id: newChallenge.id,
        title: newChallenge.name,
        name: newChallenge.name,
        description: newChallenge.description,
        image_url: newChallenge.imageUrl,
        start_date: newChallenge.startDate.toISOString().split('T')[0],
        end_date: newChallenge.endDate.toISOString().split('T')[0],
        total_days: newChallenge.totalDays,
        status: newChallenge.status,
        visibility: newChallenge.visibility,
        rules: newChallenge.rules,
        rewards: newChallenge.rewardSummary,
        participants_count: 0,
        completion_rate: 0,
      },
    });
  } catch (error: any) {
    console.error('Error creating challenge:', error);
    return res.status(500).json({ success: false, error: 'Failed to create challenge' });
  }
});

/**
 * PUT /api/admin/challenges/:id
 * Updates challenge settings or status
 */
router.put('/challenges/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { title, name, description, start_date, startDate, end_date, endDate, total_days, totalDays, status, visibility, rules, rewards, rewardSummary, image_url, imageUrl } = req.body;

    const challengeName = title || name;
    const start = start_date || startDate;
    const end = end_date || endDate;
    const days = total_days || totalDays;
    const image = image_url || imageUrl;

    const updated = await prisma.challenge.update({
      where: { id },
      data: {
        name: challengeName ? challengeName.trim() : undefined,
        description: description !== undefined ? (description ? description.trim() : null) : undefined,
        imageUrl: image !== undefined ? image : undefined,
        startDate: start ? new Date(start) : undefined,
        endDate: end ? new Date(end) : undefined,
        totalDays: days ? parseInt(days, 10) : undefined,
        status: status || undefined,
        visibility: visibility || undefined,
        rules: rules !== undefined ? (rules ? rules.trim() : null) : undefined,
        rewardSummary: rewards !== undefined || rewardSummary !== undefined ? (rewards || rewardSummary || null) : undefined,
      },
    });

    return res.json({
      success: true,
      challenge: {
        id: updated.id,
        title: updated.name,
        name: updated.name,
        description: updated.description,
        image_url: updated.imageUrl,
        start_date: updated.startDate.toISOString().split('T')[0],
        end_date: updated.endDate.toISOString().split('T')[0],
        total_days: updated.totalDays,
        status: updated.status,
        visibility: updated.visibility,
        rules: updated.rules,
        rewards: updated.rewardSummary,
      },
    });
  } catch (error: any) {
    console.error('Error updating challenge:', error);
    return res.status(500).json({ success: false, error: 'Failed to update challenge' });
  }
});

/**
 * DELETE /api/admin/challenges/:id
 * Deletes challenge
 */
router.delete('/challenges/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    await prisma.challenge.delete({ where: { id } });
    return res.json({ success: true, message: 'Challenge deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting challenge:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete challenge' });
  }
});

// ============================================================
// 4. DAY-BY-DAY WORKOUT BUILDER & EXERCISES
// ============================================================

/**
 * GET /api/admin/challenges/:id/days
 * Fetches all workout days and prescribed exercises for a challenge
 */
router.get('/challenges/:id/days', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const days = await prisma.workoutDay.findMany({
      where: { challengeId: id },
      include: {
        exercises: {
          orderBy: { order: 'asc' },
        },
        _count: {
          select: { completions: true },
        },
      },
      orderBy: { dayNumber: 'asc' },
    });

    return res.json({ success: true, days });
  } catch (error: any) {
    console.error('Error fetching workout days:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve workout days' });
  }
});

/**
 * POST /api/admin/challenges/:id/days/:dayNum/exercises
 * Adds or replaces exercises for a specific workout day
 */
router.post('/challenges/:id/days/:dayNum/exercises', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const dayNumber = parseInt(String(req.params.dayNum), 10);
    const { title, description, reward, exercises } = req.body;

    let workoutDay = await prisma.workoutDay.findUnique({
      where: {
        uq_challenge_day: {
          challengeId: id,
          dayNumber,
        },
      },
    });

    if (!workoutDay) {
      workoutDay = await prisma.workoutDay.create({
        data: {
          challengeId: id,
          dayNumber,
          title: title || `Day ${dayNumber} Workout`,
          description: description || null,
          reward: reward || '+10 Points',
        },
      });
    } else if (title || description || reward) {
      workoutDay = await prisma.workoutDay.update({
        where: { id: workoutDay.id },
        data: {
          title: title || workoutDay.title,
          description: description !== undefined ? description : workoutDay.description,
          reward: reward !== undefined ? reward : workoutDay.reward,
        },
      });
    }

    // If exercises array provided, replace existing exercises
    if (Array.isArray(exercises)) {
      await prisma.exercise.deleteMany({
        where: { workoutDayId: workoutDay.id },
      });

      const exerciseData = exercises.map((ex: any, idx: number) => ({
        workoutDayId: workoutDay.id,
        name: ex.name ? String(ex.name).trim() : `Exercise ${idx + 1}`,
        description: ex.description ? String(ex.description).trim() : null,
        sets: parseInt(ex.sets, 10) || 3,
        reps: ex.reps ? String(ex.reps) : '10',
        restSeconds: parseInt(ex.restSeconds, 10) || 60,
        order: idx + 1,
      }));

      await prisma.exercise.createMany({ data: exerciseData });
    }

    const updatedDay = await prisma.workoutDay.findUnique({
      where: { id: workoutDay.id },
      include: { exercises: { orderBy: { order: 'asc' } } },
    });

    return res.json({ success: true, workoutDay: updatedDay });
  } catch (error: any) {
    console.error('Error saving workout exercises:', error);
    return res.status(500).json({ success: false, error: 'Failed to save workout day exercises' });
  }
});

// ============================================================
// 5. REWARDS MANAGEMENT
// ============================================================

/**
 * POST /api/admin/rewards
 * Creates a milestone reward for a challenge
 */
router.post('/rewards', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { challengeId, name, description, points, dayNumber } = req.body;

    if (!challengeId || !name) {
      return res.status(400).json({ success: false, error: 'Challenge ID and reward name are required' });
    }

    const reward = await prisma.reward.create({
      data: {
        challengeId,
        name: String(name).trim(),
        description: description ? String(description).trim() : null,
        points: parseInt(points, 10) || 10,
        dayNumber: dayNumber ? parseInt(dayNumber, 10) : null,
      },
    });

    return res.status(201).json({ success: true, reward });
  } catch (error: any) {
    console.error('Error creating reward:', error);
    return res.status(500).json({ success: false, error: 'Failed to create reward' });
  }
});

export default router;
