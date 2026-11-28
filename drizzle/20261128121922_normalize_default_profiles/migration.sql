UPDATE `profiles`
SET `is_default` = 0
WHERE `is_default` = 1
  AND `name` <> (
    SELECT `name` FROM `profiles` WHERE `is_default` = 1 ORDER BY `name` LIMIT 1
  );
