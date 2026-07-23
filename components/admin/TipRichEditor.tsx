'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useEditor, useEditorState, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableCell } from '@tiptap/extension-table-cell'

// Trình soạn thảo bài Tips kiểu Word (TipTap / ProseMirror). CHỈ dùng cho bài Tips (admin form).
//   Passage đề thi vẫn dùng RichTextEditor cũ (không đổi). Xuất HTML → server sanitizeTipHtml (chốt bảo mật)
//   dọn lại lúc lưu + lúc render public. Ảnh upload qua onImageUpload (bucket 'media', src storage public).

// Ảnh có thuộc tính width (%/px) để chỉnh cỡ như Word — render thành style="width:…".
const SizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).style.width || el.getAttribute('width') || null,
        renderHTML: (attrs) => (attrs.width ? { style: `width: ${attrs.width}` } : {}),
      },
    }
  },
})

type Props = {
  value: string
  onChange: (html: string) => void
  ariaLabel: string
  placeholder?: string
  onImageUpload?: (file: File) => Promise<string | null>
}

export function TipRichEditor({ value, onChange, ariaLabel, placeholder, onImageUpload }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef(onImageUpload)
  uploadRef.current = onImageUpload

  const editor = useEditor({
    immediatelyRender: false, // Next SSR: tránh hydration mismatch
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] }, // khớp allowlist sanitize (chỉ H2/H3) + thiết kế Tips
        link: {
          openOnClick: false,
          autolink: true,
          protocols: ['http', 'https', 'mailto'],
          HTMLAttributes: { rel: 'noopener nofollow', target: '_blank' },
        },
      }),
      SizableImage.configure({ inline: false, allowBase64: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: placeholder ?? 'Soạn nội dung bài viết…' }),
    ],
    content: value || '',
    editorProps: {
      attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': ariaLabel },
      // Dán/kéo-thả ẢNH → upload rồi chèn (thay vì nhúng base64).
      handlePaste: (_view, event) => handleImageEvent(event.clipboardData?.files),
      handleDrop: (_view, event) => handleImageEvent((event as DragEvent).dataTransfer?.files),
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  // upload + chèn ảnh (dùng chung cho nút, paste, drop). Trả true nếu đã xử lý ảnh (chặn hành vi mặc định).
  const insertUploadedImages = useCallback(
    async (files: File[]) => {
      const up = uploadRef.current
      if (!up || !editor) return
      for (const f of files) {
        if (!f.type.startsWith('image/')) continue
        const url = await up(f)
        if (url) editor.chain().focus().setImage({ src: url }).run()
      }
    },
    [editor],
  )

  function handleImageEvent(files: FileList | null | undefined): boolean {
    if (!uploadRef.current) return false
    const imgs = Array.from(files ?? []).filter((f) => f.type.startsWith('image/'))
    if (imgs.length === 0) return false
    void insertUploadedImages(imgs)
    return true // đã xử lý → ProseMirror không dán/thả mặc định
  }

  // Đồng bộ value từ ngoài (reset form) mà KHÔNG gây vòng lặp onUpdate.
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', { emitUpdate: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor])

  if (!editor) {
    return <div className="admin-rte"><div className="tip-rte-area" style={{ minHeight: 320 }} /></div>
  }

  return (
    <div className="admin-rte tip-rte">
      <Toolbar editor={editor} onPickImage={onImageUpload ? () => fileRef.current?.click() : undefined} />
      {onImageUpload && (
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) void insertUploadedImages(Array.from(e.target.files))
            e.target.value = ''
          }}
        />
      )}
      <EditorContent editor={editor} className="tip-rte-area" />
    </div>
  )
}

// ————————————————————————————————————————————————————————————————
// Toolbar
function Toolbar({ editor, onPickImage }: { editor: Editor; onPickImage?: () => void }) {
  // Chỉ re-render toolbar khi trạng thái active thay đổi (perf).
  const s = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      underline: editor.isActive('underline'),
      strike: editor.isActive('strike'),
      h2: editor.isActive('heading', { level: 2 }),
      h3: editor.isActive('heading', { level: 3 }),
      bullet: editor.isActive('bulletList'),
      ordered: editor.isActive('orderedList'),
      quote: editor.isActive('blockquote'),
      alignLeft: editor.isActive({ textAlign: 'left' }),
      alignCenter: editor.isActive({ textAlign: 'center' }),
      alignJustify: editor.isActive({ textAlign: 'justify' }),
      link: editor.isActive('link'),
      image: editor.isActive('image'),
      inTable: editor.isActive('table'),
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
    }),
  })

  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Nhập URL liên kết (để trống để bỏ liên kết):', prev ?? 'https://')
    if (url === null) return
    if (url.trim() === '') editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }

  return (
    <div className="admin-rte-bar">
      <Btn on={s.bold} title="In đậm (Ctrl+B)" css={{ fontWeight: 800 }} onClick={() => editor.chain().focus().toggleBold().run()}>B</Btn>
      <Btn on={s.italic} title="In nghiêng (Ctrl+I)" css={{ fontStyle: 'italic', fontWeight: 700 }} onClick={() => editor.chain().focus().toggleItalic().run()}>I</Btn>
      <Btn on={s.underline} title="Gạch chân (Ctrl+U)" css={{ textDecoration: 'underline', fontWeight: 700 }} onClick={() => editor.chain().focus().toggleUnderline().run()}>U</Btn>
      <Btn on={s.strike} title="Gạch ngang" css={{ textDecoration: 'line-through', fontWeight: 700 }} onClick={() => editor.chain().focus().toggleStrike().run()}>S</Btn>
      <Sep />
      <Btn on={s.h2} title="Tiêu đề (H2)" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>Tiêu đề</Btn>
      <Btn on={s.h3} title="Phụ đề (H3)" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>Phụ đề</Btn>
      <Btn title="Đoạn văn thường" onClick={() => editor.chain().focus().setParagraph().run()}>Đoạn</Btn>
      <Sep />
      <Btn on={s.bullet} title="Danh sách gạch đầu dòng" onClick={() => editor.chain().focus().toggleBulletList().run()}>• Danh sách</Btn>
      <Btn on={s.ordered} title="Danh sách đánh số" onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. Đánh số</Btn>
      <Btn on={s.quote} title="Trích dẫn" onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝ Trích</Btn>
      <Sep />
      <Btn on={s.alignLeft} title="Căn trái" onClick={() => editor.chain().focus().setTextAlign('left').run()}>⯇</Btn>
      <Btn on={s.alignCenter} title="Căn giữa" onClick={() => editor.chain().focus().setTextAlign('center').run()}>≡</Btn>
      <Btn on={s.alignJustify} title="Căn đều" onClick={() => editor.chain().focus().setTextAlign('justify').run()}>☰</Btn>
      <Sep />
      <Btn on={s.link} title="Chèn/sửa liên kết" onClick={setLink}>🔗 Link</Btn>
      {onPickImage && <Btn title="Chèn ảnh (hoặc dán/kéo-thả ảnh vào bài)" onClick={onPickImage}>🖼 Ảnh</Btn>}
      <Btn title="Chèn bảng 3×3" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>⊞ Bảng</Btn>
      <Sep />
      <Btn title="Hoàn tác (Ctrl+Z)" disabled={!s.canUndo} onClick={() => editor.chain().focus().undo().run()}>↶</Btn>
      <Btn title="Làm lại (Ctrl+Y)" disabled={!s.canRedo} onClick={() => editor.chain().focus().redo().run()}>↷</Btn>

      {/* Cỡ ảnh — chỉ hiện khi đang chọn 1 ảnh */}
      {s.image && (
        <>
          <Sep />
          <span className="admin-rte-hint">Cỡ ảnh:</span>
          <Btn title="Ảnh nhỏ (25%)" onClick={() => editor.chain().focus().updateAttributes('image', { width: '25%' }).run()}>25%</Btn>
          <Btn title="Ảnh vừa (50%)" onClick={() => editor.chain().focus().updateAttributes('image', { width: '50%' }).run()}>50%</Btn>
          <Btn title="Ảnh lớn (75%)" onClick={() => editor.chain().focus().updateAttributes('image', { width: '75%' }).run()}>75%</Btn>
          <Btn title="Ảnh cả hàng (100%)" onClick={() => editor.chain().focus().updateAttributes('image', { width: '100%' }).run()}>Full</Btn>
          <Btn title="Cỡ gốc" onClick={() => editor.chain().focus().updateAttributes('image', { width: null }).run()}>Gốc</Btn>
        </>
      )}

      {/* Thao tác bảng — chỉ hiện khi con trỏ trong bảng */}
      {s.inTable && (
        <>
          <Sep />
          <span className="admin-rte-hint">Bảng:</span>
          <Btn title="Thêm cột" onClick={() => editor.chain().focus().addColumnAfter().run()}>+Cột</Btn>
          <Btn title="Xoá cột" onClick={() => editor.chain().focus().deleteColumn().run()}>−Cột</Btn>
          <Btn title="Thêm hàng" onClick={() => editor.chain().focus().addRowAfter().run()}>+Hàng</Btn>
          <Btn title="Xoá hàng" onClick={() => editor.chain().focus().deleteRow().run()}>−Hàng</Btn>
          <Btn title="Gộp/tách ô" onClick={() => editor.chain().focus().mergeOrSplit().run()}>Gộp ô</Btn>
          <Btn title="Xoá bảng" onClick={() => editor.chain().focus().deleteTable().run()}>Xoá bảng</Btn>
        </>
      )}
    </div>
  )
}

function Btn({
  children,
  onClick,
  title,
  on,
  disabled,
  css,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  on?: boolean
  disabled?: boolean
  css?: React.CSSProperties
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={on || undefined}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // giữ vùng chọn trong editor khi bấm nút
      onClick={onClick}
      className={`admin-rte-btn${on ? ' is-active' : ''}`}
      style={css}
    >
      {children}
    </button>
  )
}

const Sep = () => <span className="admin-rte-sep" aria-hidden="true" />
