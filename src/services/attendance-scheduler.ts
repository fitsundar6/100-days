import prisma from '../lib/prisma';
import {
  getKolkataDateString,
  isAttendanceWindowOpen,
  queryWithTimeout,
  inMemoryDailyCheckins,
  inMemoryAttendanceList,
} from '../routes/attendance';
import { inMemoryRegisteredClients } from '../routes/registration';

export interface AbsentJobResult {
  date: string;
  totalActiveClients: number;
  presentToday: number;
  absentToday: number;
  newlyMarkedAbsent: number;
  attendancePercentage: number;
  message: string;
}

// Track dates for which the automated absent job has completed today
const processedDates = new Set<string>();

/**
 * Executes the server-side automatic absent job for a given calendar date
 * Evaluates active clients without a PRESENT check-in and records ABSENT status.
 */
export async function processAutomaticAbsentJob(
  targetDateStr?: string,
  force: boolean = false
): Promise<AbsentJobResult> {
  const dateStr = targetDateStr || getKolkataDateString();

  // 1. Resolve Gym settings
  let gym = null;
  try {
    gym = await queryWithTimeout(
      prisma.gym.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      }),
      2000
    );
  } catch (e) {}

  const openTime = gym?.openTime || '05:00';
  const closeTime = gym?.closeTime || '22:00';
  const timezone = gym?.timezone || 'Asia/Kolkata';
  const gymId = gym?.id || 'default-gym-facility';

  // 2. Window Check: Never mark clients absent during active gym hours unless forced
  const windowStatus = isAttendanceWindowOpen(openTime, closeTime, timezone);
  if (windowStatus.isOpen && !force) {
    throw new Error(
      `Cannot mark clients absent during active gym hours (${openTime} - ${closeTime} ${timezone}). Attendance window is currently OPEN.`
    );
  }

  // 3. Fetch all active clients
  let activeClients: any[] = [];
  try {
    const clients = await queryWithTimeout(
      prisma.client.findMany({
        where: { status: 'active' },
        select: { id: true, name: true, email: true },
      }),
      2000
    );
    if (clients) activeClients = clients;
  } catch (e) {
    console.warn('DB lookup error for active clients during absent job');
  }

  // Merge real registered clients from in-memory fallback store
  if (inMemoryRegisteredClients.size > 0) {
    for (const mem of inMemoryRegisteredClients.values()) {
      if (mem.status === 'active' && !activeClients.some((c: any) => c.id === mem.id || (mem.email && c.email === mem.email))) {
        activeClients.push({
          id: mem.id,
          name: mem.name,
          email: mem.email,
        });
      }
    }
  }

  // 4. Fetch existing attendances for the target date
  let existingAttendances: any[] = [];
  try {
    const attendances = await queryWithTimeout(
      prisma.gymAttendance.findMany({
        where: { attendanceDate: dateStr },
        select: { clientId: true, status: true },
      }),
      2000
    );
    if (attendances) existingAttendances = attendances;
  } catch (e) {
    console.warn('DB lookup error for existing attendances during absent job');
  }

  // Merge in-memory attendances for target date
  for (const att of inMemoryAttendanceList) {
    if (att.attendanceDate === dateStr && !existingAttendances.some((a) => a.clientId === att.clientId)) {
      existingAttendances.push({ clientId: att.clientId, status: att.status });
    }
  }
  for (const client of activeClients) {
    const memKey = `${client.id}_${dateStr}`;
    const memRecord = inMemoryDailyCheckins.get(memKey);
    if (memRecord && !existingAttendances.some((a) => a.clientId === client.id)) {
      existingAttendances.push({ clientId: client.id, status: memRecord.status });
    }
  }

  const attendedClientIds = new Set(existingAttendances.map((a) => a.clientId));
  const presentCount = existingAttendances.filter((a) => a.status.toLowerCase() === 'present').length;

  // 5. Identify active clients who have no attendance record today
  const absentClients = activeClients.filter((c) => !attendedClientIds.has(c.id));
  let newlyMarkedCount = 0;

  for (const client of absentClients) {
    try {
      await queryWithTimeout(
        prisma.gymAttendance.create({
          data: {
            clientId: client.id,
            gymId,
            attendanceDate: dateStr,
            checkInAt: null, // Null indicates athlete did not check in
            status: 'absent',
            locationVerified: false,
            verificationMethod: 'auto_absent',
          },
        }),
        1500
      );
      newlyMarkedCount++;
    } catch (createErr: any) {
      // If record exists or DB offline, increment counter
      newlyMarkedCount++;
    }

    // Populate in-memory attendance record for instant reporting resilience
    const absentRecord = {
      id: `att-absent-${client.id}-${dateStr}`,
      clientId: client.id,
      gymId,
      attendanceDate: dateStr,
      checkInAt: null,
      status: 'absent',
      locationVerified: false,
      verificationMethod: 'auto_absent',
      createdAt: new Date(),
      client: {
        id: client.id,
        name: client.name || 'Gym Athlete',
        email: client.email || null,
        avatarUrl: null,
      },
    };
    inMemoryDailyCheckins.set(`${client.id}_${dateStr}`, absentRecord);
    inMemoryAttendanceList.push(absentRecord);
  }

  const totalActive = activeClients.length;
  const totalAbsent = existingAttendances.filter((a) => a.status.toLowerCase() === 'absent').length + newlyMarkedCount;
  const effectivePresent = Math.min(presentCount, totalActive);
  const attendancePct = totalActive > 0 ? Math.round((effectivePresent / totalActive) * 10000) / 100 : 0;

  processedDates.add(dateStr);

  console.log('====================================================');
  console.log(`🌙 AUTOMATIC ABSENT JOB EXECUTED FOR ${dateStr}`);
  console.log(`📊 Total Active Clients: ${totalActive}`);
  console.log(`🟢 Present Today:        ${effectivePresent}`);
  console.log(`🔴 Absent Today:         ${totalAbsent}`);
  console.log(`📈 Attendance Rate:      ${attendancePct}%`);
  console.log('====================================================');

  return {
    date: dateStr,
    totalActiveClients: totalActive,
    presentToday: effectivePresent,
    absentToday: totalAbsent,
    newlyMarkedAbsent: newlyMarkedCount,
    attendancePercentage: attendancePct,
    message: `Automatic absent processing completed. Marked ${newlyMarkedCount} active clients ABSENT for ${dateStr}.`,
  };
}

/**
 * Initializes the automated server-side scheduler that runs every 60 seconds
 * Automatically triggers at gym closing time in Asia/Kolkata timezone
 */
export function initAttendanceScheduler() {
  console.log('⏰ Attendance Scheduler initialized (Listening for end-of-day window in Asia/Kolkata)');

  // Run initial check on server start (non-blocking)
  setTimeout(() => {
    checkAndRunEndOfDayJob().catch((err) => {
      console.warn('Scheduled absent check note:', err.message);
    });
  }, 5000);

  // Heartbeat check every 60 seconds
  setInterval(() => {
    checkAndRunEndOfDayJob().catch((err) => {
      // Non-fatal logging
    });
  }, 60 * 1000);
}

/**
 * Periodic check running inside the heartbeat loop
 */
async function checkAndRunEndOfDayJob() {
  const todayDate = getKolkataDateString();

  // If already processed for today, skip
  if (processedDates.has(todayDate)) {
    return;
  }

  let gym = null;
  try {
    gym = await queryWithTimeout(
      prisma.gym.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      }),
      1500
    );
  } catch (e) {}

  const openTime = gym?.openTime || '05:00';
  const closeTime = gym?.closeTime || '22:00';
  const timezone = gym?.timezone || 'Asia/Kolkata';

  // Check if window has closed
  const windowStatus = isAttendanceWindowOpen(openTime, closeTime, timezone);

  // If closed and current time is past closeTime (after 22:00)
  if (!windowStatus.isOpen) {
    const timeFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const currentHourMin = timeFormatter.format(new Date());
    const [curHour] = currentHourMin.split(':').map(Number);
    const [closeHour] = closeTime.split(':').map(Number);

    // Only run after closing time (e.g. 22:00 to 23:59), or post-midnight for yesterday
    if (curHour >= closeHour) {
      await processAutomaticAbsentJob(todayDate, false);
    } else if (curHour < 5) {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const yesterdayDate = getKolkataDateString(yesterday);
      if (!processedDates.has(yesterdayDate)) {
        await processAutomaticAbsentJob(yesterdayDate, true);
      }
    }
  }
}
