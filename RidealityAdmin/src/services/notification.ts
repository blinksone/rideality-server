import { useSnackbar, type OptionsObject, type SnackbarMessage } from 'notistack';

export function useNotify() {
  const { enqueueSnackbar } = useSnackbar();

  return {
    success: (message: SnackbarMessage, options?: OptionsObject) =>
      enqueueSnackbar(message, { variant: 'success', ...options }),
    error: (message: SnackbarMessage, options?: OptionsObject) =>
      enqueueSnackbar(message, { variant: 'error', ...options }),
    info: (message: SnackbarMessage, options?: OptionsObject) =>
      enqueueSnackbar(message, { variant: 'info', ...options }),
    warning: (message: SnackbarMessage, options?: OptionsObject) =>
      enqueueSnackbar(message, { variant: 'warning', ...options }),
  };
}
