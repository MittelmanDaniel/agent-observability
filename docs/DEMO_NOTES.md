# Demo notes

## Sections: mild error vs full error

**Why we like sections:** The trajectory analyzer surfaces **mild / partial failures** (e.g. “got stuck here”, “repeated attempt”, “import/typo”) in addition to hard failures. So you see *where* a run went off the rails, not just “succeeded” or “failed”.

**Example run (sections find a mild error, not a full crash):**  
https://agent-observability-dldc9626d-mittelmandaniels-projects.vercel.app/runs/nebius-MicroPyramid__forex-python-27-357?source=custom

Use this in the demo to show that sections add interpretability beyond the final status.

---

## Modal: track run progress

**Sandboxes** (where swe-rex runs agent commands):  
https://modal.com/apps/mittelmandaniel/main/deployed/swe-rex?activeTab=sandboxes&live=true

**SWE-agent runner app** (orchestrator that runs `sweagent run` and writes to ES):  
https://modal.com/apps/mittelmandaniel/main/deployed/swe-agent-runner

Use these to watch live logs and sandbox activity while a run is in progress.
