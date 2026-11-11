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
        description="Repository for customer commercial proposals, term sheets, and pricing drafts."
      />

      <Card
        title="Saved Proposals"
        subtitle="Proposal repository"
      >
        <div className="py-12 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 mb-3">
            <FileText className="w-6 h-6" aria-hidden="true" />
          </div>
          <h3 className="text-[16px] font-semibold text-slate-900">
            Proposals Pipeline
          </h3>
          <p className="mt-1 text-[13px] text-slate-500 max-w-md">
            No saved proposals are listed here yet. Create and calculate proposals in the Proposal Configurator.
          </p>
          <div className="mt-4">
            <Button
              to="/catalogue"
              variant="outline"
              size="md"
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
