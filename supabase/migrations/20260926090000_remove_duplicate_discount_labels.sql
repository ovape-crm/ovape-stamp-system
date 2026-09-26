-- 할인 버튼명에 이미 '할인'이 포함된 상태에서 이력 문구에 다시 붙었던 기존 데이터를 정리한다.
update public.logs
set note = replace(note, '할인할인', '할인')
where note like '%할인할인%';
