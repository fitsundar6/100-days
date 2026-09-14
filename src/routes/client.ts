import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// ============================================================
// 1. PUBLIC CHALLENGE OVERVIEW
// ============================================================

/**
 * GET /api/public/challenge/:id
 * Returns public challenge details, total days, current day, and milestone rewards
 */
router.get('/challenge/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);

    // Look up by exact ID or find first active challenge
    const challenge: any = await prisma.challenge.findFirst({
      where: {
        OR: [{ id }, { status: 'active' }],
      },
      include: {
        rewards: {
          orderBy: { dayNumber: 'asc' },
        },
        _count: {
          select: { participants: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge) {
      return res.status(404).json({ success: false, error: 'Challenge not found' });
    }

    // Calculate current day number relative to start date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(challenge.startDate);
    start.setHours(0, 0, 0, 0);

    const diffDays = Math.round((today.getTime() - start.getTime()) / (1000 * 86400));
    const currentDay = Math.min(Math.max(diffDays + 1, 1), challenge.totalDays);

    return res.json({
      success: true,
      challenge: {
        id: challenge.id,
        name: challenge.name,
        title: challenge.name,
        description: challenge.description,
        startDate: challenge.startDate.toISOString().split('T')[0],
        endDate: challenge.endDate.toISOString().split('T')[0],
        totalDays: challenge.totalDays,
        currentDay,
        status: challenge.status,
        participantsCount: challenge._count?.participants || 0,
        rewards: challenge.rewards || [],
      },
    });
  } catch (error: any) {
    console.error('Error fetching public challenge:', error);
    return res.status(500).json({ success: false, error: 'Failed to load challenge' });
  }
});

// ============================================================
// 2. TODAY'S PRESCRIBED WORKOUT & EXERCISES
// ============================================================

/**
 * GET /api/public/challenge/:id/workout/:dayNumber
 * Returns prescribed workout day, exercises, sets, reps, rest time, and reward
 */
router.get('/challenge/:id/workout/:dayNumber', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const dayNum = parseInt(String(req.params.dayNumber), 10) || 1;

    // 1. Find challenge
    const challenge = await prisma.challenge.findFirst({
      where: {
        OR: [{ id }, { status: 'active' }],
      },
    });

    if (!challenge) {
      return res.status(404).json({ success: false, error: 'Challenge not found' });
    }

    // 2. Find workout day with exercises
    let workoutDay = await prisma.workoutDay.findUnique({
      where: {
        uq_challenge_day: {
          challengeId: challenge.id,
          dayNumber: dayNum,
        },
      },
      include: {
        exercises: {
          orderBy: { order: 'asc' },
        },
      },
    });

    // If day doesn't exist, create default template
    if (!workoutDay) {
      workoutDay = await prisma.workoutDay.create({
        data: {
          challengeId: challenge.id,
          dayNumber: dayNum,
          title: `Day ${dayNum} — Transformation Protocol`,
          description: 'Complete all prescribed sets with strict execution.',
          reward: '+10 Points',
        },
        include: {
          exercises: true,
        },
      });
    }

    // If no exercises assigned yet, populate standard defaults
    let exercises = workoutDay.exercises;
    if (exercises.length === 0) {
      const defaultExercises = [
        { workoutDayId: workoutDay.id, name: 'Barbell Bench Press', description: 'Compound chest press.', sets: 4, reps: '8-10', restSeconds: 90, order: 1 },
        { workoutDayId: workoutDay.id, name: 'Incline Dumbbell Press', description: 'Upper chest angle.', sets: 3, reps: '10-12', restSeconds: 60, order: 2 },
        { workoutDayId: workoutDay.id, name: 'Cable Chest Flyes', description: 'Continuous pectoral tension.', sets: 3, reps: '12-15', restSeconds: 60, order: 3 },
        { workoutDayId: workoutDay.id, name: 'Triceps Rope Pushdown', description: 'Full elbow extension.', sets: 4, reps: '10-12', restSeconds: 45, order: 4 },
        { workoutDayId: workoutDay.id, name: 'Overhead DB Triceps Extension', description: 'Long head stretch.', sets: 3, reps: '10-12', restSeconds: 60, order: 5 },
      ];
      await prisma.exercise.createMany({ data: defaultExercises });
      exercises = await prisma.exercise.findMany({
        where: { workoutDayId: workoutDay.id },
        orderBy: { order: 'asc' },
      });
    }

    return res.json({
      success: true,
      day: {
        id: workoutDay.id,
        dayNumber: workoutDay.dayNumber,
        title: workoutDay.title,
        description: workoutDay.description,
        reward: workoutDay.reward,
      },
      exercises: exercises.map((ex) => ({
        id: ex.id,
        name: ex.name,
        description: ex.description,
        sets: ex.sets,
        reps: ex.reps,
        restSeconds: ex.restSeconds,
        order: ex.order,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching workout day:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve workout prescription' });
  }
});

// ============================================================
// 3. ATHLETE JOIN / ONBOARDING
// ============================================================

/**
 * POST /api/public/join
 * Enrolls or identifies an athlete by phone number
 */
router.post('/join', async (req: Request, res: Response) => {
  try {
    const { challengeId, name, phone, email, startingWeight } = req.body;

    if (!phone || !name) {
      return res.status(400).json({ success: false, error: 'Name and phone number are required' });
    }

    const cleanPhone = String(phone).trim();
    const cleanName = String(name).trim();

    // Find or create Client
    let client = await prisma.client.findUnique({
      where: { phone: cleanPhone },
    });

    if (!client) {
      const parsedWeight = startingWeight ? parseFloat(startingWeight) : null;
      client = await prisma.client.create({
        data: {
          name: cleanName,
          phone: cleanPhone,
          email: email ? String(email).trim().toLowerCase() : null,
          startingWeight: parsedWeight,
          currentWeight: parsedWeight,
          status: 'active',
        },
      });

      if (parsedWeight) {
        await prisma.weightLog.create({
          data: {
            clientId: client.id,
            weight: parsedWeight,
            note: 'Initial enrollment check-in',
          },
        });
      }
    }

    // Find challenge
    let challenge = null;
    if (challengeId) {
      challenge = await prisma.challenge.findUnique({ where: { id: String(challengeId) } });
    }
    if (!challenge) {
      challenge = await prisma.challenge.findFirst({
        where: { status: 'active' },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!challenge) {
      return res.status(400).json({ success: false, error: 'No active challenge found' });
    }

    // Link participant
    const participant = await prisma.challengeParticipant.upsert({
      where: {
        uq_client_challenge: {
          clientId: client.id,
          challengeId: challenge.id,
        },
      },
      update: { status: 'active' },
      create: {
        clientId: client.id,
        challengeId: challenge.id,
        status: 'active',
      },
    });

    return res.json({
      success: true,
      participant: {
        id: participant.id,
        clientId: client.id,
        challengeId: challenge.id,
        name: client.name,
        phone: client.phone,
        startingWeight: client.startingWeight,
      },
    });
  } catch (error: any) {
    console.error('Error joining challenge:', error);
    return res.status(500).json({ success: false, error: 'Failed to join challenge' });
  }
});

// ============================================================
// 4. START WORKOUT SESSION
// ============================================================

/**
 * POST /api/public/workout/start
 * Starts a workout session (prevents duplicate completed records)
 */
router.post('/workout/start', async (req: Request, res: Response) => {
  try {
    const { participantId, challengeId, dayNumber } = req.body;
    const dayNum = parseInt(dayNumber, 10);
    const pId = String(participantId);

    if (!participantId || !dayNum) {
      return res.status(400).json({ success: false, error: 'Participant ID and Day Number are required' });
    }

    // Check if participant exists
    const participant = await prisma.challengeParticipant.findUnique({
      where: { id: pId },
      include: { challenge: true },
    });

    if (!participant) {
      return res.status(404).json({ success: false, error: 'Participant record not found' });
    }

    // Find or create workout day
    let workoutDay = await prisma.workoutDay.findUnique({
      where: {
        uq_challenge_day: {
          challengeId: participant.challengeId,
          dayNumber: dayNum,
        },
      },
    });

    if (!workoutDay) {
      workoutDay = await prisma.workoutDay.create({
        data: {
          challengeId: participant.challengeId,
          dayNumber: dayNum,
          title: `Day ${dayNum} Workout`,
        },
      });
    }

    // Check if already completed
    const existingCompletion = await prisma.workoutCompletion.findUnique({
      where: {
        uq_participant_day_completion: {
          participantId: participant.id,
          workoutDayId: workoutDay.id,
        },
      },
    });

    if (existingCompletion && existingCompletion.status === 'completed') {
      return res.json({
        success: true,
        session: existingCompletion,
        alreadyCompleted: true,
        message: 'This workout has already been completed.',
      });
    }

    // Resume or create in_progress completion
    const session = await prisma.workoutCompletion.upsert({
      where: {
        uq_participant_day_completion: {
          participantId: participant.id,
          workoutDayId: workoutDay.id,
        },
      },
      update: {
        status: 'in_progress',
      },
      create: {
        participantId: participant.id,
        workoutDayId: workoutDay.id,
        startedAt: new Date(),
        status: 'in_progress',
      },
    });

    return res.json({ success: true, session });
  } catch (error: any) {
    console.error('Error starting workout:', error);
    return res.status(500).json({ success: false, error: 'Failed to start workout session' });
  }
});

// ============================================================
// 5. FINISH WORKOUT & LOG PERFORMANCE
// ============================================================

/**
 * POST /api/public/workout/finish
 * Saves completion time, duration, status 'completed',
 * and records set-by-set exercise logs (weight kg & reps)
 */
router.post('/workout/finish', async (req: Request, res: Response) => {
  try {
    const { participantId, workoutDayId, durationSeconds, exerciseLogs } = req.body;
    const pId = String(participantId);
    const dayId = String(workoutDayId);

    if (!participantId || !workoutDayId) {
      return res.status(400).json({ success: false, error: 'Participant ID and Workout Day ID are required' });
    }

    const duration = parseInt(durationSeconds, 10) || 1800;
    const finishTime = new Date();

    // 1. Upsert completion
    const completion = await prisma.workoutCompletion.upsert({
      where: {
        uq_participant_day_completion: {
          participantId: pId,
          workoutDayId: dayId,
        },
      },
      update: {
        completedAt: finishTime,
        durationSeconds: duration,
        status: 'completed',
      },
      create: {
        participantId: pId,
        workoutDayId: dayId,
        startedAt: new Date(Date.now() - duration * 1000),
        completedAt: finishTime,
        durationSeconds: duration,
        status: 'completed',
      },
    });

    // 2. Save detailed ExerciseLog records (set-by-set kg and reps)
    if (Array.isArray(exerciseLogs) && exerciseLogs.length > 0) {
      // Clear previous logs for this completion to allow clean update
      await prisma.exerciseLog.deleteMany({
        where: { completionId: completion.id },
      });

      const logsToInsert: any[] = [];
      for (const log of exerciseLogs) {
        if (log.exerciseId && log.setNumber) {
          logsToInsert.push({
            completionId: completion.id,
            exerciseId: String(log.exerciseId),
            setNumber: parseInt(log.setNumber, 10),
            repsCompleted: parseInt(log.repsCompleted, 10) || 0,
            weightUsed: parseFloat(log.weightUsed) || 0,
          });
        }
      }

      if (logsToInsert.length > 0) {
        await prisma.exerciseLog.createMany({ data: logsToInsert });
      }
    }

    // 3. Check for milestone rewards (e.g. Day 7, 14, 30, 100)
    const workoutDay = await prisma.workoutDay.findUnique({
      where: { id: dayId },
      include: {
        challenge: {
          include: { rewards: true },
        },
      },
    });

    let unlockedReward = null;
    if (workoutDay) {
      const milestoneReward = workoutDay.challenge.rewards.find(
        (r) => r.dayNumber === workoutDay.dayNumber
      );

      if (milestoneReward) {
        unlockedReward = await prisma.rewardClaim.upsert({
          where: {
            uq_participant_reward: {
              participantId: pId,
              rewardId: milestoneReward.id,
            },
          },
          update: { status: 'unlocked' },
          create: {
            participantId: pId,
            rewardId: milestoneReward.id,
            status: 'unlocked',
          },
        });
      }
    }

    return res.json({
      success: true,
      completion,
      unlockedReward,
      message: 'Workout successfully submitted and saved to PostgreSQL!',
    });
  } catch (error: any) {
    console.error('Error finishing workout:', error);
    return res.status(500).json({ success: false, error: 'Failed to record workout completion' });
  }
});

// ============================================================
// 6. ATHLETE PROGRESS & PERSONAL RECORDS
// ============================================================

/**
 * GET /api/public/participant/:participantId/progress
 * Returns athlete's completion history, total volume, and unlocked badges
 */
router.get('/participant/:participantId/progress', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.participantId);

    const participant: any = await prisma.challengeParticipant.findUnique({
      where: { id },
      include: {
        client: true,
        challenge: true,
        completions: {
          where: { status: 'completed' },
          include: {
            workoutDay: true,
            exerciseLogs: {
              include: { exercise: true },
            },
          },
          orderBy: { completedAt: 'desc' },
        },
        rewardClaims: {
          include: { reward: true },
        },
      },
    });

    if (!participant) {
      return res.status(404).json({ success: false, error: 'Participant not found' });
    }

    // Calculate Personal Records & Total Volume
    const prMap: Record<string, { weight: number; reps: number }> = {};
    let totalVolumeKg = 0;
    let totalSetsLogged = 0;
    let totalRepsLogged = 0;

    const completions = participant.completions || [];
    completions.forEach((comp: any) => {
      (comp.exerciseLogs || []).forEach((log: any) => {
        const exName = log.exercise?.name || 'Exercise';
        const volume = log.weightUsed * log.repsCompleted;
        totalVolumeKg += volume;
        totalSetsLogged += 1;
        totalRepsLogged += log.repsCompleted;

        if (!prMap[exName] || log.weightUsed > prMap[exName].weight) {
          prMap[exName] = { weight: log.weightUsed, reps: log.repsCompleted };
        }
      });
    });

    const completedDaysCount = completions.length;
    const totalDays = participant.challenge?.totalDays || 100;
    const progressPct = Math.min(100, Math.round((completedDaysCount / totalDays) * 100));

    return res.json({
      success: true,
      athlete: {
        name: participant.client?.name || 'Alpha X Athlete',
        phone: participant.client?.phone || '',
        startingWeight: participant.client?.startingWeight,
        currentWeight: participant.client?.currentWeight,
        daysCompleted: completedDaysCount,
        totalDays,
        progressPct,
        totalVolumeKg: Math.round(totalVolumeKg),
        totalSets: totalSetsLogged,
        totalReps: totalRepsLogged,
        personalRecords: prMap,
        rewards: (participant.rewardClaims || []).map((rc: any) => ({
          name: rc.reward?.name,
          description: rc.reward?.description,
          points: rc.reward?.points,
          claimedAt: rc.claimedAt,
        })),
        recentCompletions: completions.slice(0, 5).map((c: any) => ({
          dayNumber: c.workoutDay?.dayNumber,
          title: c.workoutDay?.title,
          completedAt: c.completedAt,
          durationSeconds: c.durationSeconds,
        })),
      },
    });
  } catch (error: any) {
    console.error('Error fetching participant progress:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve athlete progress' });
  }
});

// ============================================================
// 7. ATHLETE WEIGHT UPDATE
// ============================================================

/**
 * POST /api/public/participant/:participantId/weight
 * Athlete submits weight check-in
 */
router.post('/participant/:participantId/weight', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.participantId);
    const { weight, note } = req.body;

    if (!weight) {
      return res.status(400).json({ success: false, error: 'Weight is required' });
    }

    const participant = await prisma.challengeParticipant.findUnique({
      where: { id },
    });

    if (!participant) {
      return res.status(404).json({ success: false, error: 'Participant not found' });
    }

    const parsedWeight = parseFloat(weight);

    const log = await prisma.weightLog.create({
      data: {
        clientId: participant.clientId,
        weight: parsedWeight,
        note: note ? String(note).trim() : 'Athlete self check-in',
      },
    });

    await prisma.client.update({
      where: { id: participant.clientId },
      data: { currentWeight: parsedWeight },
    });

    return res.json({ success: true, log });
  } catch (error: any) {
    console.error('Error updating weight:', error);
    return res.status(500).json({ success: false, error: 'Failed to record weight' });
  }
});

export default router;
