import PageHero from '@/components/design/PageHero';

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  badge?: string;
  actions?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, breadcrumbs, badge, actions }: PageHeaderProps) {
  const heroBadge = badge ?? breadcrumbs?.[0]?.label ?? 'Admin portal';

  return (
    <PageHero
      badge={heroBadge}
      title={title}
      description={subtitle ?? 'Manage platform operations from your admin dashboard.'}
      actions={actions}
    />
  );
}
