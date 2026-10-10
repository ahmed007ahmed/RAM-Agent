export function workflowStartError(input = {}) {
  if (input.stage !== 'IN_PROGRESS' || input.ownerConfirmed !== true || input.executionStarted !== true || !Number.isFinite(Number(input.startedAt))) {
    return 'لا تُحفظ المهمة في السحابة إلا بعد صدور أمر بدء التنفيذ وبدء العامل.';
  }
  return '';
}
