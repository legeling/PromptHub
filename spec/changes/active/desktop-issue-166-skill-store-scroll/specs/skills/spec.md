# Skill Store Sidebar Scroll Spec

## Modified Requirements

### Requirement: Skill store sources remain reachable

When the desktop Skill Store source group contains more entries than fit inside the visible sidebar panel, the source group must scroll within the sidebar and allow the user to reach the final source entry and the add-store entry without resizing the app window.

#### Scenario: Many custom store sources

- Given the Skill module is open
- And Skill Store is expanded
- And the user has many custom store sources
- When the sidebar content exceeds the viewport height
- Then the store source list owns a vertical scroll region
- And fixed Skill navigation entries remain visible above the scroll region
- And the bottom source entries are reachable within the sidebar
