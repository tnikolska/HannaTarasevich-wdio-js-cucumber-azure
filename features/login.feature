Feature: The Internet Guinea Pig Website

  @C2
  Scenario: As a user I can log into the secure area
    Expected to be failed

    Given I am on the login page
    When I login with <username> and <password>
    Then I should see a flash message saying <message>

    Examples:
      | username | password             | message                         |
      | tomsmith | SuperSecretPassword! | You logged into a secure area!! |


  @C6
  Scenario: As a user I can log into the secure area 2
    Expected to be passed

    Given I am on the login page
    When I login with <username> and <password>
    Then I should see a flash message saying <message>

    Examples:
      | username | password             | message                        |
      | tomsmith | SuperSecretPassword! | You logged into a secure area! |
