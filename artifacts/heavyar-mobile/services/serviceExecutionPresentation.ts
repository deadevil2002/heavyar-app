import type { ServiceExecutionAction, ServiceExecutionDetail } from './serviceExecutionService';

export function serviceExecutionActions(detail: ServiceExecutionDetail): { primary?: ServiceExecutionAction; secondary?: ServiceExecutionAction } {
  const { access, execution } = detail;
  const actions: { primary?: ServiceExecutionAction; secondary?: ServiceExecutionAction } = {};
  if (execution.serviceKind === 'equipment_rental') {
    if (execution.rentalStatus === 'accepted') actions.primary = 'record_handover';
    if (execution.rentalStatus === 'in_progress') { actions.primary = 'record_return'; actions.secondary = 'record_progress'; }
    if (execution.rentalStatus === 'completion_requested' && access === 'customer') actions.secondary = 'dispute_completion';
    return actions;
  }
  if (access === 'provider' && execution.status === 'confirmed') {
    actions.primary = execution.serviceKind === 'transporter' ? 'confirm_pickup' : 'start';
  } else if (access === 'provider' && execution.status === 'in_progress') {
    const delivered = execution.events.some(event => event.action === 'confirm_delivery');
    actions.primary = execution.serviceKind === 'transporter' && !delivered ? 'confirm_delivery' : 'request_completion';
    actions.secondary = 'record_progress';
  } else if (access === 'customer' && execution.status === 'completion_requested') {
    actions.primary = 'confirm_completion';
    actions.secondary = 'dispute_completion';
  } else if (execution.status === 'in_progress') actions.secondary = 'record_progress';
  return actions;
}
