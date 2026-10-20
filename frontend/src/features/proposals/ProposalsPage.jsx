import { PageHeader } from '../../components/common/PageHeader'
import { Card } from '../../components/common/Card'
import { Badge } from '../../components/common/Badge'
import { FileText, ArrowRight } from 'lucide-react'
import { Button } from '../../components/common/Button'

export function ProposalsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Saved Proposals"
        breadcrumbs={[
          { label: 'Commercial Operations' },
          { label: 'Saved Proposals' },
        ]}
        description="Comprehensive repository and approval pipeline for customer commercial proposals, term sheets, and pricing drafts."
        badge={<Badge variant="neutral">Step 5 Rebuild Target</Badge>}
      />

      <Card
        title="Saved Proposals Placeholder"
        subtitle="Awaiting Step 5 rebuild"
      >
        <div className="py-12 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 mb-3">
            <FileText className="w-6 h-6" aria-hidden="true" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">
            Proposals Pipeline Module
          </h3>
          <p className="mt-1 text-xs text-slate-500 max-w-md">
            This page placeholder preserves routing integrity during the controlled frontend reset. It will be rebuilt in Step 5 after the Calculator workflow is established.
          </p>
          <div className="mt-4">
            <Button
              to="/catalogue"
              variant="outline"
              size="sm"
              icon={ArrowRight}
              iconPosition="right"
            >
              Back to Product Catalogue
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default ProposalsPage
