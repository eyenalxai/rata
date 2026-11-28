UPDATE `profiles`
SET `is_default` = 0
WHERE `is_default` = 1
  AND `name` <> (
    SELECT `name` FROM `profiles` WHERE `is_default` = 1 ORDER BY `name` LIMIT 1
  );--> statement-breakpoint
UPDATE `profiles`
SET `is_default` = 1
WHERE `name` = (
  SELECT `name` FROM `profiles` ORDER BY `name` LIMIT 1
)
AND NOT EXISTS (SELECT 1 FROM `profiles` WHERE `is_default` = 1);
