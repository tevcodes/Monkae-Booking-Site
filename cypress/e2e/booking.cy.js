describe('Monkae Booking System', () => {
  
  beforeEach(() => {

    cy.visit('http://localhost:5173') 
  })

  it('Complete Client Booking Flow', () => {

    cy.get('#services-container', { timeout: 10000 }).should('be.visible')
    
 
    cy.get('#services-container').children().first().click()


    cy.get('#time-slots-container').should('be.visible')
    
 
    cy.get('#time-slots-container').children().first().click()


    cy.get('#final-step').should('be.visible')

    cy.get('#name-input').type('Cypress Test User')
    cy.get('#phone-input').type('0712345678')
    cy.get('#email-input').type('test@cypress.io')


    cy.get('#staff-select').then(($select) => {
      if ($select.find('option').length > 0) {
        cy.get('#staff-select').select(1) 
      }
    })

 
    cy.get('#privacy-check').check()
    cy.get('button.cta-button').contains('Book Appointment').click()

    cy.get('#success-modal').should('be.visible')
    cy.contains('Your booking request has been sent').should('be.visible')
  })
})