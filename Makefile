.PHONY: e2e help

help:
	@echo "Available targets:"
	@echo "  e2e  — Start backend + frontend locally, run Playwright tests, tear down"

e2e:
	@bash scripts/e2e.sh
