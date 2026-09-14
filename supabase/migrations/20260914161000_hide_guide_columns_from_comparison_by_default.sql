update public.comparison_columns
set is_visible_in_comparison = false
where name in ('기기 사진', '기기 사용법', '기초 사용법');
