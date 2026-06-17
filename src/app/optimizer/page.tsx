'use client';

export default function OptimizerPage() {
  return (
    <div style={{ width: '100%', height: '100vh', overflow: 'hidden' }}>
      <iframe
        src="/optimizer.html"
        style={{ width: '100%', height: '100%', border: 'none' }}
        title="Menu Optimizer"
      />
    </div>
  );
}
