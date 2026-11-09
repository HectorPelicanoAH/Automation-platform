@ignore
Feature: Prepare one independent synthetic guest context
  Scenario: Create an isolated context without cached mutable state
    Given url baseUrl
    And path '/api/demo/contexts'
    And request { countryIso: '#(countryIso)', languageIso: '#(languageIso)', brand: 'demo' }
    When method post
    Then status 201
    And match response contains { id: '#uuid', countryIso: '#(countryIso)', languageIso: '#(languageIso)', brand: 'demo' }
    * def contextId = response.id
