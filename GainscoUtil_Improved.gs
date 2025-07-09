package util

uses gw.api.database.IQueryBeanResult
uses gw.api.database.Queries
uses gw.api.database.Query
uses gw.api.util.DisplayableException
uses pcf.api.Location


/* Improved version - Created by SDamodaran on 9/6/2023. Improved for phone number search combinations.*/


class GainscoUtil {
  public static function findContactByPhoneNumber(
      searchCriteria : ABContactSearchCriteria,
      CurrentLocation : Location,
      searchSpec : gw.api.webservice.addressbook.contactapi.ABContactSearchSpecWithoutPaging,
      isClearBundle : boolean
  ) : gw.api.database.IQueryBeanResult<entity.ABContact> {

    var PageHelper = new gw.api.contact.ABProximitySearchPageHelper()
    var phoneNumSearch = searchCriteria.PhoneNumber_Ext
    var contactSearchtype = searchCriteria.ContactSubtype?.Code
    var validPhoneNumber = (phoneNumSearch != null and phoneNumSearch.length() >= 3)
    
    // Validate minimum phone number length
    if (phoneNumSearch != null and not validPhoneNumber) {
      throw new DisplayableException("Enter at least 3 digits in Phone number")
    }
    
    // If no phone number provided, use standard proximity search
    if (phoneNumSearch == null) {
      return PageHelper.performProximitySearch(CurrentLocation, searchCriteria, searchSpec, isClearBundle) as gw.api.database.IQueryBeanResult<entity.ABContact>
    }
    
    // Main logic: Handle phone number search with various combinations
    var allMatchContacts = new java.util.ArrayList<String>()
    
    // Check if this is a phone-only search (no other criteria)
    if (isPhoneOnlySearch(searchCriteria)) {
      return performPhoneOnlySearch(phoneNumSearch, contactSearchtype)
    }
    
    // For combination searches, use integrated approach
    return performCombinationSearch(searchCriteria, CurrentLocation, searchSpec, isClearBundle, phoneNumSearch, PageHelper)
  }

  /**
   * Determines if this is a phone-only search (no other search criteria)
   */
  private static function isPhoneOnlySearch(searchCriteria : ABContactSearchCriteria): boolean {
    return (isEmptyOrNull(searchCriteria.FirstName) and
            isEmptyOrNull(searchCriteria.LastName) and 
            isEmptyOrNull(searchCriteria.OrganizationName) and
            isEmptyOrNull(searchCriteria.TaxID) and
            isEmptyOrNull(searchCriteria.SSNExt) and
            isEmptyOrNull(searchCriteria.CityDenorm) and
            isEmptyOrNull(searchCriteria.StateDenorm) and
            isEmptyOrNull(searchCriteria.PostalCodeDenorm) and
            isEmptyOrNull(searchCriteria.Keyword) and
            (searchCriteria.Address == null or searchCriteria.Address.DisplayName.equalsIgnoreCase("<empty>")) and
            (searchCriteria.Tags == null or searchCriteria.Tags.isEmpty()))
  }
  
  /**
   * Helper function to check if a string is null or empty
   */
  private static function isEmptyOrNull(value : String): boolean {
    return value == null or value.trim().isEmpty()
  }
  
  /**
   * Performs phone-only search across all contact types
   */
  private static function performPhoneOnlySearch(phoneNumSearch : String, contactSearchtype : String): IQueryBeanResult<entity.ABContact> {
    var allMatchContacts = new java.util.ArrayList<String>()
    
    // Build query for phone number search
    var queryBuilder = Query.make(entity.ABContact)
    
    // Add contact subtype filter if specified
    if (contactSearchtype != null and contactSearchtype != "ABContact") {
      queryBuilder.compare(entity.ABContact#Subtype.Code, Equals, contactSearchtype)
    }
    
    // Add phone number conditions
    queryBuilder.or(\q -> {
      q.startsWith(entity.ABContact#HomePhone, phoneNumSearch, true)
      q.startsWith(entity.ABContact#WorkPhone, phoneNumSearch, true)
    })
    
    var contactResults = queryBuilder.select()
    allMatchContacts.addAll(java.util.Arrays.asList(contactResults*.PublicID))
    
    // Search ABPerson specifically for cell phone
    var personQueryBuilder = Query.make(ABPerson)
    if (contactSearchtype != null and contactSearchtype != "ABContact") {
      personQueryBuilder.compare(ABPerson#Subtype.Code, Equals, contactSearchtype)
    }
    
    personQueryBuilder.or(\q -> {
      q.startsWith(ABPerson#CellPhone, phoneNumSearch, true)
      q.startsWith(ABPerson#HomePhone, phoneNumSearch, true)
      q.startsWith(ABPerson#WorkPhone, phoneNumSearch, true)
    })
    
    var personResults = personQueryBuilder.select() as IQueryBeanResult<entity.ABContact>
    allMatchContacts.addAll(java.util.Arrays.asList(personResults*.PublicID))
    
    if (allMatchContacts.isEmpty()) {
      throw new DisplayableException("The search returned zero results.")
    }
    
    return Query.make(entity.ABContact)
        .compareIn(entity.ABContact#PublicID, allMatchContacts.toTypedArray())
        .select()
  }
  
  /**
   * Performs combination search (phone number + other criteria)
   */
  private static function performCombinationSearch(
      searchCriteria : ABContactSearchCriteria,
      CurrentLocation : Location,
      searchSpec : gw.api.webservice.addressbook.contactapi.ABContactSearchSpecWithoutPaging,
      isClearBundle : boolean,
      phoneNumSearch : String,
      PageHelper : gw.api.contact.ABProximitySearchPageHelper): IQueryBeanResult<entity.ABContact> {
    
    var allMatchContacts = new java.util.ArrayList<String>()
    
    // Strategy 1: Try direct database query for specific field combinations
    var directQueryResults = performDirectCombinationQuery(searchCriteria, phoneNumSearch)
    if (directQueryResults != null and not directQueryResults.isEmpty()) {
      allMatchContacts.addAll(java.util.Arrays.asList(directQueryResults*.PublicID))
    }
    
    // Strategy 2: Use proximity search and filter by phone number
    try {
      var proximityResults = PageHelper.performProximitySearch(CurrentLocation, searchCriteria, searchSpec, isClearBundle) as gw.api.database.IQueryBeanResult<entity.ABContact>
      if (proximityResults != null) {
        proximityResults.each(\elt -> {
          if (contactMatchesPhoneNumber(elt, phoneNumSearch)) {
            if (not allMatchContacts.contains(elt.PublicID)) {
              allMatchContacts.add(elt.PublicID)
            }
          }
        })
      }
    } catch (Exception ex) {
      // If proximity search fails, continue with direct query results
      print("Proximity search failed: " + ex.getMessage())
    }
    
    if (allMatchContacts.isEmpty()) {
      throw new DisplayableException("The search returned zero results.")
    }
    
    return Query.make(entity.ABContact)
        .compareIn(entity.ABContact#PublicID, allMatchContacts.toTypedArray())
        .select()
  }
  
  /**
   * Performs direct database query for specific field combinations
   */
  private static function performDirectCombinationQuery(searchCriteria : ABContactSearchCriteria, phoneNumSearch : String): IQueryBeanResult<entity.ABContact> {
    var queryBuilder = Query.make(entity.ABContact)
    var hasConditions = false
    
    // Contact subtype filter
    if (searchCriteria.ContactSubtype?.Code != null and searchCriteria.ContactSubtype.Code != "ABContact") {
      queryBuilder.compare(entity.ABContact#Subtype.Code, Equals, searchCriteria.ContactSubtype.Code)
      hasConditions = true
    }
    
    // First Name + Phone Number combination
    if (not isEmptyOrNull(searchCriteria.FirstName)) {
      queryBuilder.startsWith(entity.ABContact#FirstName, searchCriteria.FirstName, true)
      hasConditions = true
    }
    
    // Last Name + Phone Number combination  
    if (not isEmptyOrNull(searchCriteria.LastName)) {
      queryBuilder.startsWith(entity.ABContact#LastName, searchCriteria.LastName, true)
      hasConditions = true
    }
    
    // Organization Name + Phone Number combination
    if (not isEmptyOrNull(searchCriteria.OrganizationName)) {
      queryBuilder.startsWith(entity.ABContact#Name, searchCriteria.OrganizationName, true)
      hasConditions = true
    }
    
    // Tax ID (EIN) + Phone Number combination
    if (not isEmptyOrNull(searchCriteria.TaxID)) {
      queryBuilder.startsWith(entity.ABContact#TaxID, searchCriteria.TaxID, true)
      hasConditions = true
    }
    
    // SSN + Phone Number combination
    if (not isEmptyOrNull(searchCriteria.SSNExt)) {
      queryBuilder.startsWith(entity.ABContact#SSN, searchCriteria.SSNExt, true)
      hasConditions = true
    }
    
    // City + Phone Number combination
    if (not isEmptyOrNull(searchCriteria.CityDenorm)) {
      queryBuilder.startsWith(entity.ABContact#PrimaryAddress.City, searchCriteria.CityDenorm, true)
      hasConditions = true
    }
    
    // State + Phone Number combination
    if (not isEmptyOrNull(searchCriteria.StateDenorm)) {
      queryBuilder.compare(entity.ABContact#PrimaryAddress.State, Equals, searchCriteria.StateDenorm)
      hasConditions = true
    }
    
    // ZIP Code + Phone Number combination
    if (not isEmptyOrNull(searchCriteria.PostalCodeDenorm)) {
      queryBuilder.startsWith(entity.ABContact#PrimaryAddress.PostalCode, searchCriteria.PostalCodeDenorm, true)
      hasConditions = true
    }
    
    // Tags + Phone Number combination
    if (searchCriteria.Tags != null and not searchCriteria.Tags.isEmpty()) {
      queryBuilder.subselect(entity.ABContact#ID, CompareIn, entity.ABContactTag, entity.ABContactTag#ABContact.ID)
          .compareIn(entity.ABContactTag#Tag, searchCriteria.Tags*.ID.toTypedArray())
      hasConditions = true
    }
    
    // Add phone number conditions
    if (hasConditions) {
      queryBuilder.and(\phoneQuery -> {
        phoneQuery.or(\q -> {
          q.startsWith(entity.ABContact#HomePhone, phoneNumSearch, true)
          q.startsWith(entity.ABContact#WorkPhone, phoneNumSearch, true)
        })
      })
      
      var results = queryBuilder.select()
      
      // Also search ABPerson for cell phone
      var personQueryBuilder = Query.make(ABPerson)
      
      // Apply same conditions to ABPerson
      if (searchCriteria.ContactSubtype?.Code != null and searchCriteria.ContactSubtype.Code != "ABContact") {
        personQueryBuilder.compare(ABPerson#Subtype.Code, Equals, searchCriteria.ContactSubtype.Code)
      }
      
      if (not isEmptyOrNull(searchCriteria.FirstName)) {
        personQueryBuilder.startsWith(ABPerson#FirstName, searchCriteria.FirstName, true)
      }
      
      if (not isEmptyOrNull(searchCriteria.LastName)) {
        personQueryBuilder.startsWith(ABPerson#LastName, searchCriteria.LastName, true)
      }
      
      if (not isEmptyOrNull(searchCriteria.TaxID)) {
        personQueryBuilder.startsWith(ABPerson#TaxID, searchCriteria.TaxID, true)
      }
      
      if (not isEmptyOrNull(searchCriteria.SSNExt)) {
        personQueryBuilder.startsWith(ABPerson#SSN, searchCriteria.SSNExt, true)
      }
      
      if (not isEmptyOrNull(searchCriteria.CityDenorm)) {
        personQueryBuilder.startsWith(ABPerson#PrimaryAddress.City, searchCriteria.CityDenorm, true)
      }
      
      if (not isEmptyOrNull(searchCriteria.StateDenorm)) {
        personQueryBuilder.compare(ABPerson#PrimaryAddress.State, Equals, searchCriteria.StateDenorm)
      }
      
      if (not isEmptyOrNull(searchCriteria.PostalCodeDenorm)) {
        personQueryBuilder.startsWith(ABPerson#PrimaryAddress.PostalCode, searchCriteria.PostalCodeDenorm, true)
      }
      
      if (searchCriteria.Tags != null and not searchCriteria.Tags.isEmpty()) {
        personQueryBuilder.subselect(ABPerson#ID, CompareIn, entity.ABContactTag, entity.ABContactTag#ABContact.ID)
            .compareIn(entity.ABContactTag#Tag, searchCriteria.Tags*.ID.toTypedArray())
      }
      
      personQueryBuilder.or(\q -> {
        q.startsWith(ABPerson#CellPhone, phoneNumSearch, true)
        q.startsWith(ABPerson#HomePhone, phoneNumSearch, true)
        q.startsWith(ABPerson#WorkPhone, phoneNumSearch, true)
      })
      
      var personResults = personQueryBuilder.select() as IQueryBeanResult<entity.ABContact>
      
      // Combine results
      var allIDs = new java.util.ArrayList<String>()
      allIDs.addAll(java.util.Arrays.asList(results*.PublicID))
      allIDs.addAll(java.util.Arrays.asList(personResults*.PublicID))
      
      if (not allIDs.isEmpty()) {
        return Query.make(entity.ABContact)
            .compareIn(entity.ABContact#PublicID, allIDs.toTypedArray())
            .select()
      }
    }
    
    return null
  }
  
  /**
   * Checks if a contact matches the given phone number
   */
  private static function contactMatchesPhoneNumber(contact : entity.ABContact, phoneNumSearch : String): boolean {
    return (contact.HomePhone?.startsWith(phoneNumSearch) == true or
            contact.WorkPhone?.startsWith(phoneNumSearch) == true or
            (contact typeis ABPerson and contact.CellPhone?.startsWith(phoneNumSearch) == true))
  }
}