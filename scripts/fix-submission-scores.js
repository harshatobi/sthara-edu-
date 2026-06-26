const admin = require('firebase-admin');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
    }),
    databaseURL: `https://${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseio.com`
  });
}

const db = admin.firestore();

async function fixScores() {
  console.log("Fixing existing submission scores...");
  const schoolsSnap = await db.collection('schools').get();
  
  for (const schoolDoc of schoolsSnap.docs) {
    const assignmentsSnap = await schoolDoc.ref.collection('assignments').get();
    
    for (const assignmentDoc of assignmentsSnap.docs) {
      const assignment = assignmentDoc.data();
      const numQuestions = assignment.questions ? assignment.questions.length : 0;
      const expectedMaxScore = numQuestions > 0 ? numQuestions * 5 : 15;

      const submissionsSnap = await assignmentDoc.ref.collection('submissions').get();
      
      for (const subDoc of submissionsSnap.docs) {
        const subData = subDoc.data();
        let needsUpdate = false;
        let newScore = subData.score;
        let newMaxScore = subData.maxScore;

        if (subData.aiResult && subData.type === 'quiz') {
          // Recalculate deterministic score
          let calcTotalScore = 0;
          if (subData.aiResult.questions && Array.isArray(subData.aiResult.questions)) {
            subData.aiResult.questions.forEach(q => {
              calcTotalScore += (q.awardedScore || 0);
            });
          } else {
            calcTotalScore = subData.aiResult.totalScore || 0;
          }

          if (subData.score !== calcTotalScore || subData.maxScore !== expectedMaxScore) {
            newScore = calcTotalScore;
            newMaxScore = expectedMaxScore;
            needsUpdate = true;
          }
        } else if (subData.maxScore === 13) {
            newMaxScore = expectedMaxScore;
            needsUpdate = true;
        }

        if (needsUpdate) {
          console.log(`Updating submission ${subDoc.id} in assignment ${assignmentDoc.id}: Score ${subData.score}/${subData.maxScore} -> ${newScore}/${newMaxScore}`);
          await subDoc.ref.update({
            score: newScore,
            maxScore: newMaxScore,
            total: newMaxScore
          });
        }
      }
    }
  }
  console.log("Finished fixing scores!");
}

fixScores().catch(console.error);
