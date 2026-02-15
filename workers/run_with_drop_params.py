#!/usr/bin/env python3
"""
Run SWE-agent with litellm.drop_params=True so providers (OpenAI GPT-5, Anthropic Claude, etc.)
that reject unsupported params (e.g. top_p) don't error; litellm will drop them.

Usage: python run_with_drop_params.py run --agent.model.name=gpt-5 ...
(Pass the same args you would to "sweagent run ...")
"""
import sys

# Patch litellm before SWE-agent imports it
import litellm
litellm.drop_params = True

# Now run sweagent (from the editable install in the same env)
sys.argv = ["sweagent"] + sys.argv[1:]
from sweagent.run.run import main
main()
