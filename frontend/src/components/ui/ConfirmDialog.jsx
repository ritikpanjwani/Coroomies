import Modal from "./Modal";
import Button from "./Button";

export default function ConfirmDialog({
  open,
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  loading = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal open={open} onClose={onCancel} maxWidth="max-w-md" title={title}>
      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{message}</p>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
        <Button variant="secondary" fullWidth onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          variant={variant}
          fullWidth
          onClick={onConfirm}
          loading={loading}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}