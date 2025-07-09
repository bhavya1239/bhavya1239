package util

uses gw.api.database.IQueryBeanResult
uses gw.api.database.Queries
uses gw.api.database.Query
uses gw.api.util.DisplayableException
uses pcf.api.Location


/* Created by SDamodaran on 9/6/2023.*/


class GainscoUtil {
  public static function findContactByPhoneNumber(
      searchCriteria : ABContactSearchCriteria,
      CurrentLocation : Location,
      searchSpec : gw.api.webservice.addressbook.contactapi.ABContactSearchSpecWithoutPaging,
      isClearBundle : boolean
  ) : gw.api.database.IQueryBeanResult<entity.ABContact> {

    var PageHelper = new gw.api.contact.ABProximitySearchPageHelper()
    var phoneNumSearch = searchCriteria.PhoneNumber_Ext
    var contactSearchtype = searchCriteria.ContactSubtype.Code
    var validPhoneNumber = (searchCriteria.PhoneNumber_Ext != null and searchCriteria.PhoneNumber_Ext?.length()>=3) ? true : false
    var allMatchContacts = new java.util.ArrayList<String>()
    //Change in Contact subtype
    if (searchCriteria.isFieldChanged(searchCriteria#ContactSubtype) and searchCriteria.ContactSubtype != TC_ABCONTACT) {
      //search with only phone number
      if (phoneNumSearch != null and validPhoneNumber and getValidSearchParam(searchCriteria)) {
        var searchedResult = Query.make(entity.ABContact).select().where(\elt -> elt.Subtype.Code == contactSearchtype
            and (elt.HomePhone?.startsWith(phoneNumSearch) or elt.WorkPhone?.startsWith(phoneNumSearch) or
            ((elt typeis ABPerson and elt.CellPhone?.startsWith(phoneNumSearch)
                or elt?.HomePhone?.startsWith(phoneNumSearch)
                or elt?.WorkPhone?.startsWith(phoneNumSearch)))))

        if (not searchedResult.isEmpty()) {
          allMatchContacts.addAll(java.util.Arrays.asList(searchedResult*.PublicID))
          return Query.make(entity.ABContact)
              .compareIn(entity.ABContact#PublicID, allMatchContacts.toTypedArray())
              .select()
        }
        if (allMatchContacts.isEmpty()) {
          throw new DisplayableException("The search returned zero results.")
        }
      }
      else if (phoneNumSearch!=null and validPhoneNumber and (not getValidSearchParam(searchCriteria))) {
        var result = PageHelper.performProximitySearch(CurrentLocation, searchCriteria, searchSpec, isClearBundle) as gw.api.database.IQueryBeanResult<entity.ABContact>
        if (result != null) {
          result.each(\elt -> {
            if (elt.Subtype.Code == contactSearchtype and (elt?.HomePhone?.startsWith(phoneNumSearch)
                or elt?.WorkPhone?.startsWith(phoneNumSearch)
                or ((elt typeis ABPerson) and elt.CellPhone?.startsWith(phoneNumSearch)
                or elt?.HomePhone?.startsWith(phoneNumSearch)
                or elt?.WorkPhone?.startsWith(phoneNumSearch)))) {
              allMatchContacts.add(elt?.PublicID)
            }
          })
          if (allMatchContacts?.size() > 0) {
            return gw.api.database.Query.make(entity.ABContact)
                .compareIn(entity.ABContact#PublicID, allMatchContacts.toTypedArray())
                .select()
          }
        }
      }
      else if(phoneNumSearch == null and (not getValidSearchParam(searchCriteria))){
        return PageHelper.performProximitySearch(CurrentLocation, searchCriteria, searchSpec, isClearBundle) as gw.api.database.IQueryBeanResult<entity.ABContact>
      }
    }
    // scenario 2: no change in contcat subtype
    else{
      // only with Phone number search
      if (phoneNumSearch != null and validPhoneNumber ) {
        var res1 = PageHelper.performProximitySearch(CurrentLocation, searchCriteria, searchSpec, isClearBundle) as gw.api.database.IQueryBeanResult<entity.ABContact>
        if ( res1 != null) {
          res1.each(\elt -> {
            if (elt?.HomePhone?.startsWith(phoneNumSearch)
                or elt?.WorkPhone?.startsWith(phoneNumSearch)
                or ((elt typeis ABPerson) and elt.CellPhone?.startsWith(phoneNumSearch) or
                (elt?.HomePhone?.startsWith(phoneNumSearch)
                    or elt?.WorkPhone?.startsWith(phoneNumSearch)))){
              allMatchContacts.add(elt?.PublicID)
            }
          })
          if (allMatchContacts?.size() > 0) {
            return gw.api.database.Query.make(entity.ABContact)
                .compareIn(entity.ABContact#PublicID, allMatchContacts.toTypedArray())
                .select()
          }
        }
        var searchedResult = Query.make(entity.ABContact)
            .or(\q -> {
              q.startsWith(entity.ABContact#HomePhone, phoneNumSearch, true)
              q.startsWith(entity.ABContact#WorkPhone, phoneNumSearch, true)
            })
            .select()

        var personResult = Query.make(ABPerson)
            .or(\q -> {
              q.startsWith(ABPerson#CellPhone, phoneNumSearch, true)
              q.startsWith(ABPerson#HomePhone, phoneNumSearch, true)
              q.startsWith(ABPerson#WorkPhone, phoneNumSearch, true)
            })
            .select() as IQueryBeanResult<entity.ABContact>

        allMatchContacts.addAll(java.util.Arrays.asList(searchedResult*.PublicID))
        allMatchContacts.addAll(java.util.Arrays.asList(personResult*.PublicID))

        if (allMatchContacts.isEmpty()) {
          throw new DisplayableException("The search returned zero results.")
        }
        return Query.make(entity.ABContact)
            .compareIn(entity.ABContact#PublicID, allMatchContacts.toTypedArray())
            .select()
      }

    }
    if(phoneNumSearch!=null and not validPhoneNumber){
      throw new DisplayableException("Enter a least 3 digits in Phone number ")
    }
    return PageHelper.performProximitySearch(CurrentLocation, searchCriteria, searchSpec, isClearBundle) as gw.api.database.IQueryBeanResult<entity.ABContact>
  }


  private static function getValidSearchParam(searchCriteria : ABContactSearchCriteria): boolean{

    if(searchCriteria.Address.DisplayName.equalsIgnoreCase("<empty>")  and
        searchCriteria.CityDenorm == null and
        searchCriteria.CountryDenorm  == null  and
        searchCriteria.FirstName  == null and searchCriteria.FirstNameKanji  == null  and searchCriteria.Keyword==null and
        searchCriteria.KeywordKanji  == null and searchCriteria.LawFirmSpecialty  == null and searchCriteria.MedicalOrgSpecialty  == null and
        searchCriteria.OrganizationName  == null and searchCriteria.PostalCodeDenorm  == null and searchCriteria.PreferredVendors  == null and
        searchCriteria.ProximitySearchParameters  == null and searchCriteria.PublicID  == null and
        searchCriteria.SSNExt  == null and searchCriteria.Score  == null and searchCriteria.StateDenorm  == null and
        searchCriteria.SuspiciousReasnExt  == null and searchCriteria.TaxID  == null
        and searchCriteria.VendorAvailability  == null and searchCriteria.VendorType  == null) {
      return true
    }
    return false
  }
}