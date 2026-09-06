export function CoachIcon({ size = 32 }: { size?: number }) {
  return (
    <img
      src="/coaching-avatar.png"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    />
  );
}
