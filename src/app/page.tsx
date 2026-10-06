export default function Home() {
  return (
    <main style={{padding:40,fontFamily:"Arial"}}>
      <h1>Anjal Adaptive ELA Platform</h1>

      <p>Welcome to the learning platform</p>

      <hr />

      <h2>Choose your portal</h2>

      <ul>
        <li>
          <a href="/admin">Admin Dashboard</a>
        </li>

        <li>
          <a href="/teacher">Teacher Dashboard</a>
        </li>
      </ul>
    </main>
  );
}
