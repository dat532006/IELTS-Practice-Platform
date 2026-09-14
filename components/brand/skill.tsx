// Skill icons + metadata (màu, gradient cover, label) — dùng chung cho catalog chips,
// product card cover, curriculum tiles. Icon stroke inherit currentColor để đổi màu linh hoạt.

export type SkillKey = 'reading' | 'listening' | 'writing' | 'speaking' | 'mixed'

// `color` = accent TRANG TRÍ (nền ô icon, chấm, glow) — không đạt AA làm chữ. Chữ dùng `text`, nền tint dùng
// `soft`: cả hai trỏ về token trong app/globals.css (một nguồn, đã đo tỷ lệ tương phản).
export const SKILL_META: Record<
  SkillKey,
  { label: string; color: string; text: string; soft: string; grad: string; coverLabel: string }
> = {
  reading: {
    label: 'Reading',
    color: '#F2724E',
    text: 'var(--skill-reading-text)',
    soft: 'var(--skill-reading-soft)',
    grad: 'linear-gradient(135deg,#FFD9C8,#FF9F77)',
    coverLabel: 'READING',
  },
  listening: {
    label: 'Listening',
    color: '#ECA22B',
    text: 'var(--skill-listening-text)',
    soft: 'var(--skill-listening-soft)',
    grad: 'linear-gradient(135deg,#FFE6AE,#FFC95E)',
    coverLabel: 'LISTENING',
  },
  writing: {
    label: 'Writing',
    color: '#7C5CE6',
    text: 'var(--skill-writing-text)',
    soft: 'var(--skill-writing-soft)',
    grad: 'linear-gradient(135deg,#D9CFFF,#B098FF)',
    coverLabel: 'WRITING',
  },
  speaking: {
    label: 'Speaking',
    color: '#EE5C92',
    text: 'var(--skill-speaking-text)',
    soft: 'var(--skill-speaking-soft)',
    grad: 'linear-gradient(135deg,#FFE0EC,#F2A0B8)',
    coverLabel: 'SPEAKING',
  },
  mixed: {
    label: 'Combined',
    color: '#D24A7C',
    text: 'var(--skill-mixed-text)',
    soft: 'var(--skill-mixed-soft)',
    grad: 'linear-gradient(135deg,#FFE6AE,#F2A0B8)',
    coverLabel: 'FULL MOCK',
  },
}

export function skillMeta(skill: string) {
  return SKILL_META[(skill as SkillKey) in SKILL_META ? (skill as SkillKey) : 'reading']
}

// Icon glyph (stroke = currentColor). size px. viewBox 24.
export function SkillGlyph({
  skill,
  size = 20,
  strokeWidth = 2.1,
}: {
  skill: SkillKey
  size?: number
  strokeWidth?: number
}) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (skill) {
    case 'listening':
      return (
        <svg {...common}>
          <path d="M4.5 13.5V12a7.5 7.5 0 0 1 15 0v1.5" />
          <rect x="3" y="13" width="4" height="7" rx="2" />
          <rect x="17" y="13" width="4" height="7" rx="2" />
        </svg>
      )
    case 'writing':
      return (
        <svg {...common}>
          <path d="M5 19l3.6-.9L19 7.7a1.9 1.9 0 0 0 0-2.6l-.6-.6a1.9 1.9 0 0 0-2.6 0L5.4 15 4.5 19z" />
          <path d="M14.3 6.4l3.3 3.3" />
        </svg>
      )
    case 'speaking':
      return (
        <svg {...common}>
          <rect x="9.5" y="3" width="5" height="10.5" rx="2.5" />
          <path d="M6.5 11a5.5 5.5 0 0 0 11 0" />
          <path d="M12 16.5V20" />
          <path d="M9 20h6" />
        </svg>
      )
    case 'mixed':
      return (
        <svg {...common}>
          <path d="M4 5.4c2.2 0 5.6.5 8 2.1 2.4-1.6 5.8-2.1 8-2.1v11.8c-2.2 0-5.6.5-8 2.1-2.4-1.6-5.8-2.1-8-2.1z" />
          <path d="M12 7.5v11.9" />
        </svg>
      )
    case 'reading':
    default:
      return (
        <svg {...common}>
          <path d="M4 5.4c2.2 0 5.6.5 8 2.1 2.4-1.6 5.8-2.1 8-2.1v11.8c-2.2 0-5.6.5-8 2.1-2.4-1.6-5.8-2.1-8-2.1z" />
          <path d="M12 7.5v11.9" />
        </svg>
      )
  }
}

// Ô icon nền màu (rounded tile) — dùng ở filter chip & curriculum row.
export function SkillTile({
  skill,
  tileSize = 20,
  radius = 6,
  glyphSize = 13,
}: {
  skill: SkillKey
  tileSize?: number
  radius?: number
  glyphSize?: number
}) {
  return (
    <span
      className="flex flex-none items-center justify-center text-white"
      style={{
        width: tileSize,
        height: tileSize,
        borderRadius: radius,
        background: SKILL_META[skill]?.color ?? SKILL_META.reading.color,
      }}
    >
      <SkillGlyph skill={skill} size={glyphSize} strokeWidth={2.3} />
    </span>
  )
}
