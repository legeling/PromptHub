# Web Client Delta Spec

## Modified Requirements

### Requirement: Web client i18n bootstrap

The web client MUST initialize i18next before mounting the React tree.

#### Scenario: initial language uses merged resources

Given the browser or saved settings choose a supported language
When the web client initializes i18n
Then it loads the matching desktop locale and web locale
And it merges web-specific keys over desktop keys
And React renders after the merged resources are available.

#### Scenario: non-English language keeps English fallback

Given the initial language is not English
When the web client initializes i18n
Then English resources are also loaded as the fallback namespace.

### Requirement: Web authenticated workspace loading

The web client MUST not eagerly load the embedded desktop workspace before an
authenticated protected route renders.

#### Scenario: unauthenticated or setup routes avoid desktop workspace bundle

Given the user is on setup, login, or an auth-loading state
When the web client renders routing
Then the desktop workspace module remains lazy
And the route displays the existing loading/setup/login UI.

#### Scenario: protected route loads the desktop workspace on demand

Given the user is authenticated and the app is initialized
When the protected workspace route renders
Then the desktop workspace module loads through React lazy/Suspense
And the existing loading text is used as the Suspense fallback.
