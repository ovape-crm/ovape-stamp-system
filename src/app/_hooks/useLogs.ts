import { useEffect, useState, useCallback } from 'react';
import { LogsResType } from '../_types/log.types';
import { getLogs } from '@/services/logService';
import toast from 'react-hot-toast';

const useLogs = (pageSize = 10) => {
  const [items, setItems] = useState<LogsResType[]>([]);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(true);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setError('');
      const data = await getLogs(pageSize, offset);
      setItems((prev) => [...prev, ...data]);
      setHasMore(data.length === pageSize);
      setOffset((prev) => prev + data.length);
      if (offset > 0 && data.length > 0) {
        toast.success(`${data.length}개 더 불러오기 성공!`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '에러가 발생했습니다');
    } finally {
      setIsLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    // first load only
    if (offset === 0 && items.length === 0 && !isLoading) {
      void load();
    }
  }, []); // 의존성 배열을 비워서 한 번만 실행

  return {
    items,
    setItems,
    isLoading,
    error,
    hasMore,
    load,
  };
};

export default useLogs;
