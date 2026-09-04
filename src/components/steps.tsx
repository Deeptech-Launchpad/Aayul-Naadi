export function Steps({ current, total = 5 }: { current: number; total?: number }) {
  return (
    <div className="steps" aria-label={`Step ${current} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <i key={i} data-on={i < current} />
      ))}
    </div>
  );
}

export function StepHeader({
  step,
  title,
  intro,
  total = 5,
}: {
  step: number;
  title: string;
  intro: string;
  total?: number;
}) {
  return (
    <div className="stack-sm">
      <Steps current={step} total={total} />
      <div className="label" style={{ marginTop: 6 }}>Step {step} of {total}</div>
      <h1 style={{ fontSize: 25 }}>{title}</h1>
      <p style={{ fontSize: 13.5, color: "var(--txt-2)", lineHeight: 1.55 }}>{intro}</p>
    </div>
  );
}
