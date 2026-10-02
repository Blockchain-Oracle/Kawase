-- One payroll backend (decision X32): payroll is the automations `payroll` kind. The Business screen's own grouping of
-- scheduled sends goes; any sends it made stay as ordinary scheduled sends in Automations.
DROP TABLE IF EXISTS "payrolls";
