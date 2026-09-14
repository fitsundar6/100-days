// ============================================================
// ALPHA X GYM — PRISMA DATABASE SEED SCRIPT
// Populates realistic development data for 100-Day Challenge
// ============================================================

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Alpha X Gym database seeding...');

  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    // 1. Clean existing records in reverse dependency order (DEV ONLY)
    await prisma.gymAttendance.deleteMany();
    await prisma.gymQrToken.deleteMany();
    await prisma.gym.deleteMany();
    await prisma.exerciseLog.deleteMany();
    await prisma.workoutCompletion.deleteMany();
    await prisma.rewardClaim.deleteMany();
    await prisma.exercise.deleteMany();
    await prisma.workoutDay.deleteMany();
    await prisma.reward.deleteMany();
    await prisma.weightLog.deleteMany();
    await prisma.challengeParticipant.deleteMany();
    await prisma.challenge.deleteMany();
    await prisma.client.deleteMany();
    await prisma.admin.deleteMany();
    console.log('🧹 Cleaned existing development database tables.');
  } else {
    console.log('🛡️ Production environment detected: Preserving all existing database data.');
  }

  // 1.5 Create or Verify Default Gym
  let gym = await prisma.gym.findFirst({ where: { isActive: true } });
  if (!gym) {
    gym = await prisma.gym.create({
      data: {
        name: 'Alpha X Gym — Main Facility',
        latitude: parseFloat(process.env.GYM_DEFAULT_LAT || '12.9716'),
        longitude: parseFloat(process.env.GYM_DEFAULT_LNG || '77.5946'),
        allowedRadiusMeters: parseFloat(process.env.GYM_ALLOWED_RADIUS || '75.0'),
        openTime: '05:00',
        closeTime: '22:00',
        qrRefreshSeconds: 30,
        timezone: 'Asia/Kolkata',
        isActive: true,
      },
    });
    console.log(`🏋️ Created Default Gym: ${gym.name} (75m allowed radius, Asia/Kolkata)`);
  } else {
    console.log(`🏋️ Existing Gym Verified: ${gym.name}`);
  }

  // 2. Idempotent Admin (password: AlphaX@2026)
  const passwordHash = await bcrypt.hash('AlphaX@2026', 10);
  const admin = await prisma.admin.upsert({
    where: { email: 'coach@alphaxgym.com' },
    update: { name: 'Head Coach Marcus', role: 'admin' },
    create: {
      name: 'Head Coach Marcus',
      email: 'coach@alphaxgym.com',
      password: passwordHash,
      role: 'admin',
    },
  });
  console.log(`👤 Verified Admin: ${admin.name} (${admin.email})`);

  // 3. Create 100-Day Challenge
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 99);

  const challenge = await prisma.challenge.create({
    data: {
      name: 'Alpha X 100-Day Challenge',
      description:
        'The premier 100-day discipline and hypertrophy transformation challenge. Admin prescribes daily workouts, set-by-set targets, and automated rest timers.',
      startDate: today,
      endDate: endDate,
      totalDays: 100,
      status: 'active',
      adminId: admin.id,
    },
  });
  console.log(`🏆 Created Challenge: ${challenge.name}`);

  // 4. Create 100 Workout Days with rotating high-performance training splits
  const splitRoutines = [
    { title: 'Chest & Triceps Hypertrophy', desc: 'Heavy barbell pressing, dumbbell flyes, and triceps isolation.' },
    { title: 'Back & Biceps Power', desc: 'Deadlifts, lat pulldowns, seated cable rows, and bicep curls.' },
    { title: 'Leg Hypertrophy & Calves', desc: 'Barbell back squats, Romanian deadlifts, walking lunges.' },
    { title: 'Shoulders & Core Armor', desc: 'Overhead barbell press, lateral raises, face pulls, and planks.' },
    { title: 'Full Body Conditioning & HIIT', desc: 'Kettlebell swings, burpees, mountain climbers, and sled pushes.' },
    { title: 'Arm Farm & Core Stability', desc: 'Super-set bicep/tricep volume and isometric core holds.' },
    { title: 'Active Recovery & Mobility Flow', desc: 'Full-body joint mobility, foam rolling, and 10,000 steps.' },
  ];

  const workoutDaysData = [];
  for (let d = 1; d <= 100; d++) {
    const split = splitRoutines[(d - 1) % splitRoutines.length];
    const dayDate = new Date(today);
    dayDate.setDate(dayDate.getDate() + (d - 1));

    workoutDaysData.push({
      challengeId: challenge.id,
      dayNumber: d,
      date: dayDate,
      title: `Day ${d} — ${split.title}`,
      description: split.desc,
      reward: d % 7 === 0 ? `+${d * 5} Milestone Points` : '+10 Daily Points',
    });
  }

  // Create Workout Days
  await prisma.workoutDay.createMany({
    data: workoutDaysData,
  });
  console.log('📅 Created 100 Workout Days.');

  // Fetch created days for exercise mapping
  const allDays = await prisma.workoutDay.findMany({
    where: { challengeId: challenge.id },
    orderBy: { dayNumber: 'asc' },
  });

  // 5. Create Detailed Exercises for Key Days
  // Day 1: Foundation & Core Ignition
  const day1 = allDays.find((d) => d.dayNumber === 1);
  if (day1) {
    await prisma.exercise.createMany({
      data: [
        { workoutDayId: day1.id, name: 'Push-Ups', description: 'Keep elbows at 45 degrees, chest to floor.', sets: 4, reps: '15-20', restSeconds: 60, order: 1 },
        { workoutDayId: day1.id, name: 'Bodyweight Squats', description: 'Hips below parallel, chest proud.', sets: 4, reps: '20-25', restSeconds: 60, order: 2 },
        { workoutDayId: day1.id, name: 'Plank Hold', description: 'Straight line from head to heels, core braced.', sets: 3, reps: '60 sec', restSeconds: 45, order: 3 },
        { workoutDayId: day1.id, name: 'Mountain Climbers', description: 'High plank, alternate knees explosively.', sets: 3, reps: '30 sec', restSeconds: 45, order: 4 },
        { workoutDayId: day1.id, name: 'Burpees', description: 'Chest to deck, explosive vertical jump.', sets: 3, reps: '10', restSeconds: 60, order: 5 },
      ],
    });
  }

  // Day 2: Chest & Triceps Hypertrophy
  const day2 = allDays.find((d) => d.dayNumber === 2);
  let day2Exercises: any[] = [];
  if (day2) {
    day2Exercises = await Promise.all([
      prisma.exercise.create({ data: { workoutDayId: day2.id, name: 'Barbell Bench Press', description: 'Arch upper back, retract scapulae, touch lower chest.', sets: 4, reps: '8-10', restSeconds: 90, order: 1 } }),
      prisma.exercise.create({ data: { workoutDayId: day2.id, name: 'Incline Dumbbell Press', description: '30 degree incline, control the eccentric phase.', sets: 3, reps: '10-12', restSeconds: 60, order: 2 } }),
      prisma.exercise.create({ data: { workoutDayId: day2.id, name: 'Cable Chest Flyes', description: 'Deep stretch, squeeze chest hard at peak contraction.', sets: 3, reps: '12-15', restSeconds: 60, order: 3 } }),
      prisma.exercise.create({ data: { workoutDayId: day2.id, name: 'Triceps Rope Pushdown', description: 'Spread the rope at bottom, flare elbows minimally.', sets: 4, reps: '10-12', restSeconds: 45, order: 4 } }),
      prisma.exercise.create({ data: { workoutDayId: day2.id, name: 'Overhead DB Triceps Extension', description: 'Keep elbows tucked, full elbow extension overhead.', sets: 3, reps: '10-12', restSeconds: 60, order: 5 } }),
    ]);
  }

  // Day 3: Back & Biceps Power
  const day3 = allDays.find((d) => d.dayNumber === 3);
  if (day3) {
    await prisma.exercise.createMany({
      data: [
        { workoutDayId: day3.id, name: 'Barbell Deadlift', description: 'Hinge hips, drive floor away, lockout glutes.', sets: 4, reps: '6-8', restSeconds: 120, order: 1 },
        { workoutDayId: day3.id, name: 'Lat Pulldown', description: 'Drive elbows down and back to chest.', sets: 4, reps: '10-12', restSeconds: 60, order: 2 },
        { workoutDayId: day3.id, name: 'Seated Cable Row', description: 'Retract scapulae, pull handle to navel.', sets: 3, reps: '12', restSeconds: 60, order: 3 },
        { workoutDayId: day3.id, name: 'Barbell Bicep Curl', description: 'Strict form, no hip swinging.', sets: 3, reps: '10-12', restSeconds: 45, order: 4 },
      ],
    });
  }

  // Add default exercises for remaining days
  for (let i = 4; i <= 100; i++) {
    const curDay = allDays.find((d) => d.dayNumber === i);
    if (curDay) {
      await prisma.exercise.createMany({
        data: [
          { workoutDayId: curDay.id, name: 'Barbell Squats', description: 'Full depth compound leg drive.', sets: 4, reps: '10', restSeconds: 90, order: 1 },
          { workoutDayId: curDay.id, name: 'Romanian Deadlift', description: 'Hamstring stretch with neutral spine.', sets: 3, reps: '10', restSeconds: 60, order: 2 },
          { workoutDayId: curDay.id, name: 'Overhead Press', description: 'Strict shoulder press from clavicle to lockout.', sets: 4, reps: '8', restSeconds: 75, order: 3 },
          { workoutDayId: curDay.id, name: 'Hanging Leg Raises', description: 'Strict core compression.', sets: 3, reps: '15', restSeconds: 45, order: 4 },
        ],
      });
    }
  }
  console.log('💪 Created prescribed exercises for all 100 days.');

  // 6. Create 3 Sample Clients (realistic gym participants)
  const client1 = await prisma.client.create({
    data: {
      name: 'Vikram Sharma',
      phone: '+919876543210',
      email: 'vikram.sharma@example.com',
      startingWeight: 84.5,
      currentWeight: 79.2,
      endingWeight: 75.0,
      status: 'active',
    },
  });

  const client2 = await prisma.client.create({
    data: {
      name: 'Rohan Mehta',
      phone: '+919811223344',
      email: 'rohan.mehta@example.com',
      startingWeight: 92.0,
      currentWeight: 86.8,
      endingWeight: 82.0,
      status: 'active',
    },
  });

  const client3 = await prisma.client.create({
    data: {
      name: 'Aman Verma',
      phone: '+919988776655',
      email: 'aman.verma@example.com',
      startingWeight: 78.0,
      currentWeight: 74.5,
      endingWeight: 72.0,
      status: 'active',
    },
  });
  console.log('🏋️ Created 3 Clients.');

  // 7. Enroll Clients as Challenge Participants
  const part1 = await prisma.challengeParticipant.create({
    data: {
      clientId: client1.id,
      challengeId: challenge.id,
      status: 'active',
    },
  });

  const part2 = await prisma.challengeParticipant.create({
    data: {
      clientId: client2.id,
      challengeId: challenge.id,
      status: 'active',
    },
  });

  const part3 = await prisma.challengeParticipant.create({
    data: {
      clientId: client3.id,
      challengeId: challenge.id,
      status: 'active',
    },
  });

  // 8. Create Weight Tracking Progression Logs
  const weightLogsData = [
    { clientId: client1.id, date: new Date(Date.now() - 21 * 86400000), weight: 84.5, note: 'Starting Day 1 benchmark' },
    { clientId: client1.id, date: new Date(Date.now() - 14 * 86400000), weight: 82.8, note: 'Week 1 weigh-in: solid adherence' },
    { clientId: client1.id, date: new Date(Date.now() - 7 * 86400000), weight: 81.0, note: 'Week 2 weigh-in: waist down 1.5 inches' },
    { clientId: client1.id, date: new Date(), weight: 79.2, note: 'Week 3 weigh-in: target on track' },

    { clientId: client2.id, date: new Date(Date.now() - 14 * 86400000), weight: 92.0, note: 'Starting benchmark' },
    { clientId: client2.id, date: new Date(Date.now() - 7 * 86400000), weight: 89.4, note: 'Week 1 weigh-in' },
    { clientId: client2.id, date: new Date(), weight: 86.8, note: 'Week 2 weigh-in' },

    { clientId: client3.id, date: new Date(Date.now() - 7 * 86400000), weight: 78.0, note: 'Starting benchmark' },
    { clientId: client3.id, date: new Date(), weight: 74.5, note: 'Week 1 weigh-in' },
  ];

  await prisma.weightLog.createMany({ data: weightLogsData });
  console.log('⚖️ Created Weight Logs.');

  // 9. Create Sample Workout Completions & Exercise Logs
  if (day1) {
    // Vikram completed Day 1
    const comp1 = await prisma.workoutCompletion.create({
      data: {
        participantId: part1.id,
        workoutDayId: day1.id,
        startedAt: new Date(Date.now() - 86400000 - 2400000),
        completedAt: new Date(Date.now() - 86400000),
        durationSeconds: 2400, // 40 mins
        status: 'completed',
      },
    });

    // Rohan completed Day 1
    await prisma.workoutCompletion.create({
      data: {
        participantId: part2.id,
        workoutDayId: day1.id,
        startedAt: new Date(Date.now() - 86400000 - 2700000),
        completedAt: new Date(Date.now() - 86400000),
        durationSeconds: 2700, // 45 mins
        status: 'completed',
      },
    });

    // Aman completed Day 1
    await prisma.workoutCompletion.create({
      data: {
        participantId: part3.id,
        workoutDayId: day1.id,
        startedAt: new Date(Date.now() - 86400000 - 2100000),
        completedAt: new Date(Date.now() - 86400000),
        durationSeconds: 2100, // 35 mins
        status: 'completed',
      },
    });
  }

  // Vikram completed Day 2 (today) with detailed ExerciseLog sets
  if (day2 && day2Exercises.length > 0) {
    const comp2 = await prisma.workoutCompletion.create({
      data: {
        participantId: part1.id,
        workoutDayId: day2.id,
        startedAt: new Date(Date.now() - 2200000),
        completedAt: new Date(),
        durationSeconds: 2200, // 36m 40s
        status: 'completed',
      },
    });

    // Bench Press set logs
    const benchEx = day2Exercises.find((e) => e.name === 'Barbell Bench Press');
    if (benchEx) {
      await prisma.exerciseLog.createMany({
        data: [
          { completionId: comp2.id, exerciseId: benchEx.id, setNumber: 1, weightUsed: 80.0, repsCompleted: 10 },
          { completionId: comp2.id, exerciseId: benchEx.id, setNumber: 2, weightUsed: 80.0, repsCompleted: 9 },
          { completionId: comp2.id, exerciseId: benchEx.id, setNumber: 3, weightUsed: 85.0, repsCompleted: 7 },
          { completionId: comp2.id, exerciseId: benchEx.id, setNumber: 4, weightUsed: 85.0, repsCompleted: 6 },
        ],
      });
    }

    // Incline DB Press set logs
    const incEx = day2Exercises.find((e) => e.name === 'Incline Dumbbell Press');
    if (incEx) {
      await prisma.exerciseLog.createMany({
        data: [
          { completionId: comp2.id, exerciseId: incEx.id, setNumber: 1, weightUsed: 30.0, repsCompleted: 12 },
          { completionId: comp2.id, exerciseId: incEx.id, setNumber: 2, weightUsed: 32.0, repsCompleted: 10 },
          { completionId: comp2.id, exerciseId: incEx.id, setNumber: 3, weightUsed: 32.0, repsCompleted: 9 },
        ],
      });
    }
  }
  console.log('✅ Created Workout Completions & Exercise Logs.');

  // 10. Create Rewards and Reward Claims
  const reward1 = await prisma.reward.create({
    data: {
      challengeId: challenge.id,
      name: 'Day 7 • Consistency Badge',
      description: 'Unlocked by finishing 7 consecutive gym workouts with logged sets.',
      points: 50,
      dayNumber: 7,
    },
  });

  const reward2 = await prisma.reward.create({
    data: {
      challengeId: challenge.id,
      name: 'Day 14 • Discipline Shield',
      description: 'Maintained nutrition and workout consistency for two weeks.',
      points: 100,
      dayNumber: 14,
    },
  });

  const reward3 = await prisma.reward.create({
    data: {
      challengeId: challenge.id,
      name: 'Day 30 • Warrior Badge',
      description: 'One month of relentless iron discipline and measurable body fat reduction.',
      points: 250,
      dayNumber: 30,
    },
  });

  const reward4 = await prisma.reward.create({
    data: {
      challengeId: challenge.id,
      name: 'Day 100 • Alpha X Finisher',
      description: 'The ultimate transformation accomplishment. Lifetime athlete status.',
      points: 1000,
      dayNumber: 100,
    },
  });

  // Vikram unlocked Day 7 Consistency Badge
  await prisma.rewardClaim.create({
    data: {
      participantId: part1.id,
      rewardId: reward1.id,
      status: 'unlocked',
    },
  });
  console.log('🏅 Created Milestone Rewards.');

  console.log('🎉 Alpha X Gym database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
