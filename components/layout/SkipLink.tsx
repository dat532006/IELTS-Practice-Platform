export function SkipLink({ targetId = 'main-content' }: { targetId?: string }) {
  return (
    <a className="skip-link" href={`#${targetId}`}>
      Bỏ qua điều hướng
    </a>
  )
}
