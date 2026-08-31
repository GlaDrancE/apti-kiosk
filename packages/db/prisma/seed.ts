import { prisma } from '../src/index.js';

/**
 * Seeds an admin placeholder + a small question bank + one draft exam.
 *
 * The admin profile has no supabaseUserId yet: sign up in Supabase Auth with
 * SEED_ADMIN_EMAIL and the API links the profile by email on first login.
 */
async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'ayushr16060@gmail.com';

  const admin = await prisma.userProfile.upsert({
    where: { email: adminEmail },
    update: { role: 'SUPER_ADMIN' },
    create: { email: adminEmail, fullName: 'Seed Admin', role: 'SUPER_ADMIN' },
  });

  const bank = [
    {
      type: 'MCQ_SINGLE' as const,
      topic: 'Quantitative',
      difficulty: 'EASY' as const,
      text: 'A train travels 120 km in 2 hours. What is its average speed?',
      explanation: '120 / 2 = 60 km/h',
      options: [
        { text: '50 km/h', isCorrect: false },
        { text: '60 km/h', isCorrect: true },
        { text: '70 km/h', isCorrect: false },
        { text: '80 km/h', isCorrect: false },
      ],
    },
    {
      type: 'MCQ_MULTIPLE' as const,
      topic: 'Logical Reasoning',
      difficulty: 'MEDIUM' as const,
      text: 'Which of the following are prime numbers?',
      explanation: '2 and 17 are prime; 9 = 3x3 and 21 = 3x7.',
      options: [
        { text: '2', isCorrect: true },
        { text: '9', isCorrect: false },
        { text: '17', isCorrect: true },
        { text: '21', isCorrect: false },
      ],
    },
    {
      type: 'NUMERIC' as const,
      topic: 'Quantitative',
      difficulty: 'MEDIUM' as const,
      text: 'What is 15% of 240?',
      explanation: '0.15 x 240 = 36',
      numericAnswer: 36,
      options: [],
    },
    {
      type: 'MCQ_SINGLE' as const,
      topic: 'Verbal',
      difficulty: 'EASY' as const,
      text: 'Choose the word most nearly opposite to "abundant".',
      explanation: 'Scarce is the antonym of abundant.',
      options: [
        { text: 'Plentiful', isCorrect: false },
        { text: 'Scarce', isCorrect: true },
        { text: 'Ample', isCorrect: false },
        { text: 'Copious', isCorrect: false },
      ],
    },
  ];

  const questionIds: string[] = [];
  for (const q of bank) {
    const existing = await prisma.question.findFirst({ where: { text: q.text } });
    if (existing) {
      questionIds.push(existing.id);
      continue;
    }
    const created = await prisma.question.create({
      data: {
        type: q.type,
        topic: q.topic,
        difficulty: q.difficulty,
        text: q.text,
        explanation: q.explanation,
        numericAnswer: 'numericAnswer' in q ? q.numericAnswer : null,
        marks: 1,
        negativeMarks: 0.25,
        options: { create: q.options },
      },
    });
    questionIds.push(created.id);
  }

  const existingExam = await prisma.exam.findFirst({ where: { title: 'Sample Aptitude Test' } });
  if (!existingExam) {
    await prisma.exam.create({
      data: {
        title: 'Sample Aptitude Test',
        description: 'Seeded exam covering quantitative, logical and verbal aptitude.',
        durationMinutes: 30,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        passingScore: 2,
        status: 'DRAFT',
        createdById: admin.id,
        questions: {
          create: questionIds.map((questionId, i) => ({ questionId, order: i })),
        },
      },
    });
  }

  console.log(`Seeded. Admin: ${adminEmail}, questions: ${questionIds.length}`);
  console.log('Students are created in bulk from the admin UI (Students -> import CSV).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
