// NowJump curated destinations (SNX-10). This is data. Replace it after the
// SNX-D2 logging week - nothing else in the extension depends on its shape
// beyond {id, label, aliases, table|page, roles?}.
//
// roles: if present, the entry is hidden unless the user has one of them.
(function (root) {
  const CURATED = [
    { id: "cur:ecc_queue", label: "ECC Queue", aliases: ["ecc", "queue", "probe", "sensor"], table: "ecc_queue" },
    { id: "cur:ecc_agent", label: "MID Servers", aliases: ["mid", "mid server", "agent"], table: "ecc_agent" },
    { id: "cur:ecc_agent_issue", label: "MID Server Issues", aliases: ["mid issue", "mid issues"], table: "ecc_agent_issue" },
    { id: "cur:ecc_agent_capability", label: "MID Server Capabilities", aliases: ["capability", "capabilities"], table: "ecc_agent_capability_m2m" },
    { id: "cur:discovery_status", label: "Discovery Status", aliases: ["discovery", "status", "dis"], table: "discovery_status" },
    { id: "cur:discovery_log", label: "Discovery Log", aliases: ["dlog", "discovery logs"], table: "discovery_log" },
    { id: "cur:discovery_schedule", label: "Discovery Schedules", aliases: ["schedule", "schedules"], table: "discovery_schedule" },
    { id: "cur:discovery_range", label: "Discovery IP Ranges", aliases: ["range", "ranges", "ip range"], table: "discovery_range_item" },
    { id: "cur:discovery_credentials", label: "Credentials", aliases: ["cred", "creds", "credentials"], table: "discovery_credentials" },
    { id: "cur:discovery_classy", label: "Discovery Classifiers", aliases: ["classifier", "classifiers", "classy"], table: "discovery_classy" },
    { id: "cur:sa_pattern", label: "Discovery Patterns", aliases: ["pattern", "patterns"], table: "sa_pattern" },
    { id: "cur:discovery_device_history", label: "Discovery Device History", aliases: ["device history"], table: "discovery_device_history" },
    { id: "cur:cmdb_ci", label: "Configuration Items", aliases: ["ci", "cmdb", "cis"], table: "cmdb_ci" },
    { id: "cur:cmdb_rel_ci", label: "CI Relationships", aliases: ["rel", "relationships", "cmdb_rel"], table: "cmdb_rel_ci" },
    { id: "cur:cmdb_identifier", label: "CMDB Identification Rules", aliases: ["identifier", "identification", "ire rules"], table: "cmdb_identifier" },
    { id: "cur:cmdb_reconciliation", label: "CMDB Reconciliation Rules", aliases: ["reconciliation", "recon"], table: "cmdb_reconciliation_definition" },
    { id: "cur:reconcile_duplicate_task", label: "De-duplication Tasks", aliases: ["dedup", "duplicate", "duplicates"], table: "reconcile_duplicate_task" },
    { id: "cur:cmdb_health_result", label: "CMDB Health Results", aliases: ["health"], table: "cmdb_health_result" },
    { id: "cur:cloud_accounts", label: "Cloud Service Accounts", aliases: ["cloud", "aws", "azure", "gcp", "service account"], table: "cmdb_ci_cloud_service_account" },
    { id: "cur:em_alert", label: "Alerts", aliases: ["alert", "alerts", "em"], table: "em_alert" },
    { id: "cur:em_event", label: "Events", aliases: ["event", "events"], table: "em_event" },
    { id: "cur:em_alert_management_rule", label: "Alert Management Rules", aliases: ["alert rule", "alert rules"], table: "em_alert_management_rule" },
    { id: "cur:em_ci_severity_task", label: "CI Severity Tasks", aliases: ["severity task"], table: "em_ci_severity_task" },
    { id: "cur:cmdb_data_management_task", label: "CMDB Data Management Tasks", aliases: ["cmdb task", "data management"], table: "cmdb_data_management_task" },
    { id: "cur:cmdb_multisource_recomp_task", label: "Multisource Recompute Tasks", aliases: ["recomp", "recompute", "multisource"], table: "cmdb_multisource_recomp_task" },
    { id: "cur:incident", label: "Incidents", aliases: ["inc", "incident"], table: "incident" },
    { id: "cur:change_request", label: "Change Requests", aliases: ["chg", "change", "changes"], table: "change_request" },
    { id: "cur:task", label: "All Tasks", aliases: ["task", "tasks"], table: "task" },
    { id: "cur:samp_sw_subscription", label: "Software Subscriptions", aliases: ["sam", "subscription", "subscriptions", "license"], table: "samp_sw_subscription" },
    { id: "cur:sys_properties", label: "System Properties", aliases: ["props", "property", "properties", "glide"], table: "sys_properties" },
    { id: "cur:sys_upgrade_history", label: "Upgrade History", aliases: ["upgrade", "upgrades", "family"], table: "sys_upgrade_history" },
    { id: "cur:syslog", label: "System Logs", aliases: ["log", "logs", "syslog"], table: "syslog" },
    { id: "cur:syslog_transaction", label: "Transaction Logs", aliases: ["transaction", "transactions", "slow"], table: "syslog_transaction" },
    { id: "cur:sysauto_script", label: "Scheduled Jobs", aliases: ["job", "jobs", "scheduled"], table: "sysauto_script" },
    { id: "cur:sys_trigger", label: "Schedule Triggers", aliases: ["trigger", "triggers", "sys_trigger"], table: "sys_trigger" },
    { id: "cur:sys_update_set", label: "Update Sets", aliases: ["update set", "update sets", "us"], table: "sys_update_set" },
    { id: "cur:sys_user", label: "Users", aliases: ["user", "users"], table: "sys_user" },
    { id: "cur:sys_user_has_role", label: "User Roles", aliases: ["roles", "has role"], table: "sys_user_has_role" },
    { id: "cur:sys_plugins", label: "Plugins", aliases: ["plugin", "plugins"], table: "v_plugin" },
    { id: "cur:sys_db_object", label: "Tables", aliases: ["table", "tables", "dictionary"], table: "sys_db_object" },
    { id: "cur:stats", label: "Node stats", aliases: ["stats", "node", "stats.do"], page: "stats.do" },
    { id: "cur:cache", label: "Flush cache", aliases: ["cache", "cache.do", "flush"], page: "cache.do", roles: ["admin"] },
    { id: "cur:scripts", label: "Background scripts", aliases: ["background", "script", "sys.scripts"], page: "sys.scripts.do", roles: ["admin"] },
    { id: "cur:xmlstats", label: "XML stats", aliases: ["xmlstats"], page: "xmlstats.do", roles: ["admin"] },
    { id: "cur:threads", label: "Thread dump", aliases: ["threads", "thread"], page: "threads.do", roles: ["admin"] }
  ];

  // Tables tried, in order, when a bare sys_id is pasted (SNX-9).
  const SYS_ID_CANDIDATES = [
    "incident", "task", "sc_req_item", "sc_request", "sc_task", "problem", "change_request", "change_task", "em_alert", "reconcile_duplicate_task", "cmdb_data_management_task",
    "ecc_agent", "ecc_queue", "discovery_status", "discovery_schedule", "discovery_credentials", "sa_pattern",
    "cmdb_ci", "cmdb_rel_ci", "sys_user", "sys_update_set", "sys_properties", "sys_db_object", "sys_dictionary",
    "sys_script", "sys_script_include", "sysauto_script", "sys_trigger", "reconcile_duplicate_task", "sys_metadata"
  ];

  root.NJ = root.NJ || {};
  root.NJ.curated = { CURATED, SYS_ID_CANDIDATES };
})(typeof globalThis !== "undefined" ? globalThis : this);
