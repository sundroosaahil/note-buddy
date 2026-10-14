import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { panel } from './ui.jsx'

export default function Confirm({ title, text, action, onConfirm, trigger, open, onOpenChange }) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>}
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <AlertDialog.Content className={`${panel} fixed left-1/2 top-1/2 z-50 w-[min(22rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 p-5`}>
          <AlertDialog.Title className="text-base font-semibold text-slate-900 dark:text-white">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-slate-600 dark:text-slate-300">{text}</AlertDialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel className="rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700">Cancel</AlertDialog.Cancel>
            <AlertDialog.Action onClick={onConfirm} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700">{action}</AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
