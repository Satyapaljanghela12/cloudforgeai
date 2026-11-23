import Dockerode from 'dockerode';

const pipes = [
  '//./pipe/dockerDesktopLinuxEngine',
  '//./pipe/docker_engine',
  '\\\\.\\pipe\\dockerDesktopLinuxEngine',
  '\\\\.\\pipe\\docker_engine',
];

for (const socketPath of pipes) {
  try {
    const d = new Dockerode({ socketPath });
    await d.ping();
    console.log(`✓ Works: ${socketPath}`);
    const info = await d.version();
    console.log(`  Docker version: ${info.Version}`);
    break;
  } catch (e) {
    console.log(`✗ Failed: ${socketPath} — ${e.message}`);
  }
}
