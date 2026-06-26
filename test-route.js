async function test() {
  const res = await fetch('http://localhost:3000/api/tutor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ sender: 'user', text: 'give me some videos on quadratic equations' }],
      studentId: 'test-student',
      studentName: 'Test Student',
      studentClass: 'Grade 10'
    })
  });
  const data = await res.json();
  console.log(data);
}
test();
