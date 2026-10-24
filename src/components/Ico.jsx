// One icon set for the whole interface (lucide-react), house style: 1.5px
// stroke, 16px in dense rows/buttons, 20px in body. Icons are decorative —
// the words beside them carry the meaning — so they are hidden from screen
// readers. Icon-only controls must put an aria-label on the control itself.
//
// Import each icon by name from 'lucide-react' (never the whole set) and pass
// it in: <Ico icon={Check} /> or <IconText icon={Check}>Approve</IconText>.

export const Ico = ({ icon: Icon, size = 16, style, ...rest }) => (
  <Icon size={size} strokeWidth={1.5} aria-hidden="true" focusable="false"
    style={{ flexShrink: 0, verticalAlign: 'middle', ...style }} {...rest} />
)

// Icon left of its label with an 8px gap (iconRight for forward arrows).
export const IconText = ({ icon, size = 16, iconRight = false, children, style }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', ...style }}>
    {!iconRight && <Ico icon={icon} size={size} />}
    <span>{children}</span>
    {iconRight && <Ico icon={icon} size={size} />}
  </span>
)

// Native keyboard support and a consistent minimum target for icon-only actions.
export const IconButton = ({ style, ...props }) => (
  <button type="button" {...props} style={{ ...style, minWidth: 44, minHeight: 44 }} />
)
