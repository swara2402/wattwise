import clsx from 'clsx'
import { Card, CardHeader } from '../ui/Card'
import { EmptyState } from '../ui/States'

/**
 * Consistent chrome for every visualisation: title, subtitle, actions,
 * a fixed-height plot area and an optional footnote.
 */
export function ChartFrame({
  title,
  subtitle,
  icon,
  action,
  footer,
  height = 260,
  isEmpty = false,
  emptyTitle = 'No data yet',
  emptyDescription,
  emptyIcon,
  className,
  children,
  bodyClassName,
}) {
  return (
    <Card className={clsx('card-pad', className)}>
      {(title || action) && (
        <CardHeader title={title} subtitle={subtitle} icon={icon} action={action} className="mb-4" />
      )}
      {isEmpty ? (
        <div style={{ minHeight: height }} className="grid place-items-center">
          <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
        </div>
      ) : (
        <div style={{ height }} className={clsx('w-full', bodyClassName)}>
          {children}
        </div>
      )}
      {footer && <p className="mt-3 text-[0.75rem] leading-relaxed text-fg-subtle">{footer}</p>}
    </Card>
  )
}
