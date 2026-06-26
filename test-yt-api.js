async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/youtube?q=test');
    const data = await res.json();
    console.log("Status:", res.status);
    console.log("Data:", data);
  } catch(e) {
    console.log("Fetch failed:", e);
  }
}
test();
