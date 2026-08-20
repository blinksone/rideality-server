import { useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchMe } from '@/api/auth.api';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setInitialized, setUser } from '@/store/authSlice';

interface AuthProviderProps {
  children: ReactNode;
}

export default function AuthProvider({ children }: AuthProviderProps) {
  const dispatch = useAppDispatch();
  const { accessToken, initialized } = useAppSelector((s) => s.auth);

  const { data, isError, isFetched } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    enabled: Boolean(accessToken),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (data) dispatch(setUser(data));
  }, [data, dispatch]);

  useEffect(() => {
    if (!accessToken) {
      dispatch(setInitialized(true));
      return;
    }
    if (isFetched || isError) {
      dispatch(setInitialized(true));
    }
  }, [accessToken, isFetched, isError, dispatch]);

  if (!initialized) return null;

  return <>{children}</>;
}
