fetch('http://localhost:3000/api/teacher/assistant', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ topic: 'test topic', gradeLevel: '10' })
})
.then(async r => {
  const text = await r.text();
  console.log('Status:', r.status);
  console.log('Body:', text);
})
.catch(console.error);
