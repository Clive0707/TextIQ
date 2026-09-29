import { ButtonLink } from '../components/ui/Button';
import { Panel } from '../components/ui/Panel';
import { EmptyState } from '../components/ui/States';

export default function NotFoundPage() {
  return (
    <Panel>
      <EmptyState icon="explore_off" title="Page not found" action={<ButtonLink to="/" variant="secondary" icon="grid_view">Back to Overview</ButtonLink>}>
        This address doesn’t match any TextIQ page.
      </EmptyState>
    </Panel>
  );
}
