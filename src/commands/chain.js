// NowJump related-record chain configuration (SNX-12). Data, not code.
//
// Each entry describes a relation from the open record's table:
//   dir "parent"   - follow reference field `via` on the open record to one target
//   dir "children" - list target rows where `where` = open record's sys_id
//   dir "list"     - same as children but always opens a list, never resolves a single row
//   dir "listFrom" - read list field `via` on the open record, open target list filtered sys_idIN those values
//
// A relation that fails to resolve (403, empty) is simply not shown.
(function (root) {
  const CHAIN = {
    sc_req_item: [
      { label: "Request", table: "sc_request", via: "request", dir: "parent" },
      { label: "Catalog tasks", table: "sc_task", where: "request_item", dir: "children" }
    ],
    sc_request: [{ label: "Requested items", table: "sc_req_item", where: "request", dir: "children" }],
    sc_task: [{ label: "Requested item", table: "sc_req_item", via: "request_item", dir: "parent" }],
    interaction: [{ label: "Related records", table: "interaction_related_record", where: "interaction", dir: "list" }],
    incident: [
      { label: "Parent incident", table: "incident", via: "parent_incident", dir: "parent" },
      { label: "Problem", table: "problem", via: "problem_id", dir: "parent" },
      { label: "Child incidents", table: "incident", where: "parent_incident", dir: "children" }
    ],
    ecc_queue: [
      { label: "Original output", table: "ecc_queue", via: "response_to", dir: "parent" },
      { label: "Responses", table: "ecc_queue", where: "response_to", dir: "children" }
    ],
    discovery_status: [
      { label: "Discovery log", table: "discovery_log", where: "status", dir: "list" },
      { label: "Device history", table: "discovery_device_history", where: "status", dir: "list" },
      { label: "ECC queue for this run", table: "ecc_queue", where: "agent_correlator", dir: "list" }
    ],
    ecc_agent: [
      { label: "MID issues", table: "ecc_agent_issue", where: "mid_server", dir: "list" },
      { label: "Capabilities", table: "ecc_agent_capability_m2m", where: "agent", dir: "list" },
      { label: "Recent ECC traffic", table: "ecc_queue", where: "agent", dir: "list", extraQuery: "ORDERBYDESCsys_created_on" }
    ],
    cmdb_ci: [
      { label: "Relationships (parent)", table: "cmdb_rel_ci", where: "parent", dir: "list" },
      { label: "Relationships (child)", table: "cmdb_rel_ci", where: "child", dir: "list" },
      { label: "Duplicate tasks", table: "reconcile_duplicate_task", where: "duplicate_cis", dir: "list", whereOp: "LIKE" }
    ],
    em_alert: [
      { label: "Events for this alert", table: "em_event", where: "alert", dir: "list" },
      { label: "Incident", table: "incident", via: "incident", dir: "parent" },
      { label: "Configuration item", table: "cmdb_ci", via: "cmdb_ci", dir: "parent" }
    ],
    reconcile_duplicate_task: [{ label: "Duplicate CIs", table: "cmdb_ci", via: "duplicate_cis", dir: "listFrom" }],
    change_request: [{ label: "Change tasks", table: "change_task", where: "change_request", dir: "children" }],
    change_task: [{ label: "Change request", table: "change_request", via: "change_request", dir: "parent" }],
    sys_update_set: [{ label: "Customer updates", table: "sys_update_xml", where: "update_set", dir: "list" }]
  };

  // Tables that extend cmdb_ci should use the cmdb_ci chain.
  function chainFor(table) {
    if (CHAIN[table]) return CHAIN[table];
    if (/^cmdb_ci/.test(table)) return CHAIN.cmdb_ci;
    return [];
  }

  root.NJ = root.NJ || {};
  root.NJ.chain = { CHAIN, chainFor };
})(typeof globalThis !== "undefined" ? globalThis : this);
