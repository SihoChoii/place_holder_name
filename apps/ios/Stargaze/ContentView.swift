// ContentView.swift — StarTagger
//
// Everything lives in this one file: star catalog, sky math, motion + location,
// camera preview and the star overlay. Your MyApp.swift just shows ContentView().
//
// Info.plist keys you need (target > Info tab > Custom iOS Target Properties):
//   Privacy - Camera Usage Description               (NSCameraUsageDescription)
//   Privacy - Location When In Use Usage Description (NSLocationWhenInUseUsageDescription)
//
// Accuracy notes:
//   - The compass (magnetometer) is usually off by a few degrees, sometimes more near
//     metal. Use the "Heading nudge" slider to line the labels up with a star you know.
//   - Catalog positions are J2000. Precession since 2000 shifts stars by about 0.35°
//     in 2026; this is ignored (small next to the compass error).
//   - Atmospheric refraction (up to ~0.5° right at the horizon) is ignored.
//
// Star data: HYG Database v4.1 by David Nash / astronexus
//   https://github.com/astronexus/HYG-Database
//   Licensed under Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0)
//   https://creativecommons.org/licenses/by-sa/4.0/
//   Subset used here: all stars brighter than magnitude 4.0 (Sun excluded).
//   Format per line: proper name | designation | RA (hours) | Dec (degrees) | V magnitude | HYG id
//   (The HYG id is a stable number per star; your notes are saved under it.)
//
// Notes: tap a star (or near it) to write a note. Starred notes are saved on the phone
// (UserDefaults) and survive app restarts. The "Notes" button lists them all.
// Each note can pick its own ring/label color with the color wheel in the note sheet.

import SwiftUI
import UIKit
@preconcurrency import AVFoundation
import CoreMedia
import CoreMotion
import CoreLocation
import Combine
import simd

// MARK: - Star catalog

struct Star: Sendable {
    let name: String    // proper name, empty if the star has none
    let desig: String   // Bayer/Flamsteed designation, e.g. "α Lyr"
    let ra: Double      // right ascension, hours
    let dec: Double     // declination, degrees
    let mag: Double     // visual magnitude (smaller = brighter)
    let id: Int         // HYG database id, -1 if missing

    /// Short label: proper name, else designation, else the HYG number.
    var title: String {
        if !name.isEmpty { return name }
        if !desig.isEmpty { return desig }
        return "HYG \(id)"
    }

    var displayName: String {
        if name.isEmpty { return title }
        if desig.isEmpty { return name }
        return name + " (" + desig + ")"
    }

    /// Stable key used to save notes for this star.
    var noteKey: String {
        if id >= 0 { return "hyg:\(id)" }
        return "pos:" + desig + "|" + String(format: "%.5f|%.4f", ra, dec)
    }
}

enum StarCatalog {
    static let stars: [Star] = parse(rawData)

    /// Look up a star by its note key (used by the Notes list).
    static let byNoteKey: [String: Star] = {
        var d: [String: Star] = [:]
        for s in stars { d[s.noteKey] = s }
        return d
    }()

    private static func parse(_ text: String) -> [Star] {
        var result: [Star] = []
        for line in text.split(separator: "\n") {
            let parts = line.split(separator: "|", omittingEmptySubsequences: false)
            if parts.count < 5 { continue }
            guard let ra = Double(String(parts[2])),
                  let dec = Double(String(parts[3])),
                  let mag = Double(String(parts[4])) else { continue }
            var id = -1
            if parts.count >= 6, let n = Int(String(parts[5])) { id = n }
            result.append(Star(name: String(parts[0]), desig: String(parts[1]),
                               ra: ra, dec: dec, mag: mag, id: id))
        }
        return result
    }

    private static let rawData: String = """
Sirius|α CMa|6.75248|-16.7161|-1.44|32263
Canopus|α Car|6.39919|-52.6957|-0.62|30365
Arcturus|α Boo|14.26103|19.1824|-0.05|69451
Rigil Kentaurus|α1 Cen|14.66076|-60.8340|-0.01|71456
Vega|α Lyr|18.61564|38.7837|0.03|90979
Capella|α Aur|5.27815|45.9980|0.08|24549
Rigel|β Ori|5.24230|-8.2016|0.18|24378
Procyon|α CMi|7.65503|5.2250|0.40|37173
Achernar|α Eri|1.62856|-57.2368|0.45|7574
Betelgeuse|α Ori|5.91953|7.4071|0.45|27919
Hadar|β Cen|14.06373|-60.3730|0.61|68483
Altair|α Aql|19.84639|8.8683|0.76|97338
Acrux|α1 Cru|12.44331|-63.0991|0.77|60530
Aldebaran|α Tau|4.59868|16.5093|0.87|21368
||5.27793|46.0008|0.96|118360
Spica|α Vir|13.41988|-11.1613|0.98|65269
Antares|α Sco|16.49013|-26.4320|1.06|80519
Pollux|β Gem|7.75528|28.0262|1.16|37718
Fomalhaut|α PsA|22.96084|-29.6222|1.17|113008
Deneb|α Cyg|20.69053|45.2803|1.25|101767
Mimosa|β Cru|12.79536|-59.6888|1.25|62239
Toliman|α2 Cen|14.66035|-60.8383|1.35|71453
Regulus|α Leo|10.13953|11.9672|1.36|49528
Adhara|ε CMa|6.97710|-28.9721|1.50|33492
Castor|α Gem|7.57663|31.8883|1.58|36744
Gacrux|γ Cru|12.51943|-57.1132|1.59|60893
Shaula|λ Sco|17.56014|-37.1038|1.62|85665
Bellatrix|γ Ori|5.41885|6.3497|1.64|25273
Elnath|β Tau|5.43820|28.6075|1.65|25364
Miaplacidus|β Car|9.22004|-69.7172|1.67|45106
Alnilam|ε Ori|5.60356|-1.2019|1.69|26246
Alnair|α Gru|22.13721|-46.9610|1.73|108922
Alnitak|ζ Ori|5.67931|-1.9426|1.74|26662
|γ2 Vel|8.15888|-47.3366|1.75|39840
Alioth|ε UMa|12.90047|55.9598|1.76|62757
Kaus Australis|ε Sgr|18.40287|-34.3846|1.79|89906
Mirfak|α Per|3.40538|49.8612|1.79|15824
Dubhe|α UMa|11.06216|61.7510|1.81|53905
Wezen|δ CMa|7.13986|-26.3932|1.83|34354
Alkaid|η UMa|13.79235|49.3133|1.85|67088
Avior|ε Car|8.37524|-59.5095|1.86|40921
Sargas|θ Sco|17.62198|-42.9978|1.86|85965
Menkalinan|β Aur|5.99215|44.9474|1.90|28288
Atria|α TrA|16.81108|-69.0277|1.91|82022
Alhena|γ Gem|6.62853|16.3993|1.93|31601
Alsephina|δ Vel|8.74506|-54.7088|1.93|42794
Peacock|α Pav|20.42746|-56.7351|1.94|100425
Polaris|α UMi|2.52975|89.2641|1.97|11734
Mirzam|β CMa|6.37833|-17.9559|1.98|30251
Alphard|α Hya|9.45979|-8.6586|1.99|46259
Algieba|γ1 Leo|10.33287|19.8415|2.01|50440
Hamal|α Ari|2.11956|23.4624|2.01|9861
Diphda|β Cet|0.72649|-17.9866|2.04|3413
Nunki|σ Sgr|18.92109|-26.2967|2.05|92564
Menkent|θ Cen|14.11139|-36.3700|2.06|68714
Alpheratz|α And|0.13979|29.0904|2.07|676
Kochab|β UMi|14.84511|74.1555|2.07|72380
Mirach|β And|1.16219|35.6206|2.07|5436
Saiph|κ Ori|5.79594|-9.6696|2.07|27298
Tiaki|β Gru|22.71111|-46.8846|2.07|111768
Rasalhague|α Oph|17.58224|12.5600|2.08|85769
Algol|β Per|3.13615|40.9556|2.09|14540
Almach|γ1 And|2.06498|42.3297|2.10|9618
Denebola|β Leo|11.81766|14.5721|2.14|57459
Cih|γ Cas|0.94514|60.7167|2.15|4417
|γ Cen|12.69197|-48.9599|2.20|61739
Aspidiske|ι Car|9.28484|-59.2752|2.21|45425
Naos|ζ Pup|8.05974|-40.0031|2.21|39318
Alphecca|α CrB|15.57813|26.7147|2.22|76035
Mizar|ζ UMa|13.39875|54.9254|2.23|65173
Sadr|γ Cyg|20.37047|40.2567|2.23|100128
Suhail|λ Vel|9.13327|-43.4326|2.23|44689
Eltanin|γ Dra|17.94344|51.4889|2.24|87561
Schedar|α Cas|0.67512|56.5373|2.24|3172
Mintaka|δ Ori|5.53345|-0.2991|2.25|25865
Caph|β Cas|0.15289|59.1498|2.28|744
|ε Cen|13.66480|-53.4664|2.29|66447
Dschubba|δ Sco|16.00556|-22.6217|2.29|78165
Larawag|ε Sco|16.83608|-34.2932|2.29|82144
|α Lup|14.69882|-47.3882|2.30|71634
|η Cen|14.59179|-42.1578|2.33|71125
Merak|β UMa|11.03068|56.3824|2.34|53754
Izar|ε Boo|14.74978|27.0742|2.35|71879
Enif|ε Peg|21.73643|9.8750|2.38|106972
|κ Sco|17.70813|-39.0300|2.39|86403
Ankaa|α Phe|0.43806|-42.3060|2.40|2076
Phecda|γ UMa|11.89717|53.6948|2.41|57828
Sabik|η Oph|17.17297|-15.7249|2.43|83755
Scheat|β Peg|23.06290|28.0828|2.44|113521
Alderamin|α Cep|21.30963|62.5856|2.45|104861
Aludra|η CMa|7.40158|-29.3031|2.45|35806
Markeb|κ Vel|9.36856|-55.0107|2.47|45809
Aljanah|ε Cyg|20.77018|33.9703|2.48|102157
Markab|α Peg|23.07935|15.2053|2.49|113603
|ζ Oph|16.61932|-10.5671|2.54|81130
Menkar|α Cet|3.03799|4.0897|2.54|14100
|ζ Cen|13.92567|-47.2884|2.55|67786
Acrab|β1 Sco|16.09062|-19.8055|2.56|78580
Zosma|δ Leo|11.23514|20.5237|2.56|54712
|δ Cen|12.13931|-50.7224|2.58|59016
Arneb|α Lep|5.54550|-17.8223|2.58|25920
Gienah|γ Crv|12.26344|-17.5419|2.58|59621
Ascella|ζ Sgr|19.04353|-29.8801|2.60|93213
Zubeneschamali|β Lib|15.28345|-9.3829|2.61|74556
Unukalhai|α Ser|15.73780|6.4256|2.63|76835
Sheratan|β Ari|1.91067|20.8080|2.64|8884
Kraz|β Crv|12.57312|-23.3968|2.65|61166
Mahasim|θ Aur|5.99535|37.2126|2.65|28309
Phact|α Col|5.66082|-34.0741|2.65|26569
Ruchbah|δ Cas|1.43022|60.2353|2.66|6672
|β Lup|14.97554|-43.1340|2.68|73046
Muphrid|η Boo|13.91141|18.3977|2.68|67711
|α Mus|12.61974|-69.1356|2.69|61392
|μ Vel|10.77949|-49.4203|2.69|52575
Hassaleh|ι Aur|4.94989|33.1661|2.69|22961
Lesath|υ Sco|17.51273|-37.2958|2.70|85436
|π Pup|7.28571|-37.0975|2.71|35169
Kaus Media|δ Sgr|18.34990|-29.8281|2.72|89653
Tarazed|γ Aql|19.77099|10.6133|2.72|96970
Athebyne|η Dra|16.39986|61.5142|2.73|80089
Yed Prior|δ Oph|16.23909|-3.6943|2.73|79352
|θ Car|10.71595|-64.3945|2.74|52268
Porrima|γ Vir|12.69435|-1.4494|2.74|61748
|ι Cen|13.34330|-36.7123|2.75|64904
Hatysa|ι Ori|5.59055|-5.9099|2.75|26176
Zubenelgenubi|α2 Lib|14.84798|-16.0418|2.75|72396
Cebalrai|β Oph|17.72454|4.5673|2.76|86475
Cursa|β Eri|5.13083|-5.0864|2.78|23820
Kornephoros|β Her|16.50367|21.4896|2.78|80571
Rasalgethi|α1 Her|17.24413|14.3903|2.78|84086
Imai|δ Cru|12.25243|-58.7489|2.79|59565
Rastaban|β Dra|17.50721|52.3014|2.79|85410
|γ Lup|15.58568|-41.1668|2.80|76065
|ζ Her|16.68811|31.6027|2.81|81444
Nihal|β Lep|5.47076|-20.7594|2.81|25542
|β Hyi|0.42792|-77.2542|2.82|2016
Kaus Borealis|λ Sgr|18.46618|-25.4217|2.82|90217
Paikauhale|τ Sco|16.59804|-28.2160|2.82|81020
|β TrA|15.91908|-63.4307|2.83|77716
Algenib|γ Peg|0.22060|15.1836|2.83|1065
Tureis|ρ Pup|8.12574|-24.3043|2.83|39644
|α Ara|17.53070|-49.8761|2.84|85530
|β Ara|17.42167|-55.5299|2.84|84999
|ζ Per|3.90220|31.8836|2.84|18201
Alcyone|η Tau|3.79141|24.1051|2.85|17661
Castor B|α Gem|7.57683|31.8905|2.85|118485
Deneb Algedi|δ Cap|21.78401|-16.1273|2.85|107213
Vindemiatrix|ε Vir|13.03628|10.9591|2.85|63405
|α Hyi|1.97945|-61.5699|2.86|9217
Fawaris|δ Cyg|19.74957|45.1308|2.86|96858
|α Tuc|22.30837|-60.2596|2.87|109784
|γ TrA|15.31518|-68.6795|2.87|74717
Tejat|μ Gem|6.38267|22.5136|2.87|30270
Acamar|θ1 Eri|2.97102|-40.3047|2.88|13813
Albaldah|π Sgr|19.16273|-21.0236|2.88|93846
Cor Caroli|α2 CVn|12.93381|38.3184|2.89|62925
Fang|π Sco|15.98086|-26.1141|2.89|78029
Gomeisa|β CMi|7.45251|8.2893|2.89|36087
|ε Per|3.96423|40.0102|2.90|18485
Alniyat|σ Sco|16.35314|-25.5928|2.90|79870
Sadalsuud|β Aqr|21.52598|-5.5712|2.90|105936
|γ Per|3.07994|53.5064|2.91|14292
|υ Car|9.78504|-65.0720|2.92|47866
Matar|η Peg|22.71670|30.2212|2.93|111804
|τ Pup|6.83227|-50.6146|2.94|32682
Algorab|δ Crv|12.49774|-16.5154|2.94|60776
Sadalmelik|α Aqr|22.09640|-0.3199|2.95|108728
Ras Elased Australis|ε Leo|9.76419|23.7743|2.97|47772
Tianguan|ζ Tau|5.62741|21.1425|2.97|26386
Zaurak|γ Eri|3.96716|-13.5085|2.97|18497
Alnasl|γ2 Sgr|18.09680|-30.4241|2.98|88361
|γ Hya|13.31536|-23.1715|2.99|64758
|ι1 Sco|17.79308|-40.1270|2.99|86804
Okab|ζ Aql|19.09017|13.8635|2.99|93452
|β Tri|2.15906|34.9873|3.00|10041
|ψ UMa|11.16106|44.4985|3.00|54380
Aldhanab|γ Gru|21.89881|-37.3649|3.00|107742
Pherkad|γ UMi|15.34548|71.8340|3.00|74868
Xamidimura|μ1 Sco|16.86451|-38.0474|3.00|82263
|δ Per|3.71542|47.7876|3.01|17316
|ε Crv|12.16875|-22.6198|3.02|59134
|ο2 CMa|7.05041|-23.8333|3.02|33888
Furud|ζ CMa|6.33855|-30.0634|3.02|30049
Almaaz|ε Aur|5.03282|43.8233|3.03|23361
|β Mus|12.77135|-68.1081|3.04|62127
Seginus|γ Boo|14.53464|38.3083|3.04|70851
Albireo|β1 Cyg|19.51202|27.9597|3.05|95648
Dabih|β Cap|20.35019|-14.7814|3.05|100020
Mebsuta|ε Gem|6.73220|25.1311|3.06|32161
Tania Australis|μ UMa|10.37215|41.4995|3.06|50655
Altais|δ Dra|19.20922|67.6615|3.07|94081
|η Sgr|18.29379|-36.7617|3.10|89364
|α Ind|20.62612|-47.2915|3.11|101445
|ζ Hya|8.92323|5.9456|3.11|43689
|λ Cen|11.59636|-63.0198|3.11|56392
|ν Hya|10.82708|-16.1936|3.11|52789
|ζ Ara|16.97701|-55.9901|3.12|82826
Sarin|δ Her|17.25053|24.8392|3.12|84121
Talitha|ι UMa|8.98683|48.0418|3.12|44000
Wazn|β Col|5.84933|-35.7683|3.12|27559
|κ Cen|14.98602|-42.1042|3.13|73107
|α Lyn|9.35093|34.3926|3.14|45728
|HIP 46701|9.52037|-57.0344|3.16|46568
|π Her|17.25079|36.8092|3.16|84122
|θ UMa|9.54772|51.6773|3.17|46720
|ν Pup|6.62935|-43.1959|3.17|31605
|φ Sgr|18.76094|-26.9908|3.17|91754
Aldhibah|ζ Dra|17.14645|65.7147|3.17|83638
|α Cir|14.70849|-64.9751|3.18|71682
Haedus|η Aur|5.10858|41.2345|3.18|23712
|ε Lep|5.09102|-22.3710|3.19|23630
|κ Oph|16.96114|9.3750|3.19|82745
Fuyue|HIP 87261|17.83096|-37.0433|3.19|86991
Tabit|π3 Ori|4.83067|6.9613|3.19|22396
|ζ Cyg|21.21561|30.2269|3.21|104394
Errai|γ Cep|23.65582|77.6323|3.21|116361
|δ Lup|15.35620|-40.6475|3.22|74912
|η Ser|18.35517|-2.8988|3.23|89684
Alfirk|β Cep|21.47766|70.5607|3.23|105691
Yed Posterior|ε Oph|16.30536|-4.6925|3.23|79640
|α Pic|6.80319|-61.9414|3.24|32521
|θ Aql|20.18841|-0.8215|3.24|99156
|π Hya|14.10619|-26.6824|3.25|68675
|σ Pup|7.48718|-43.3014|3.25|36274
Brachium|σ Lib|15.06784|-25.2820|3.25|73486
Sulafat|γ Lyr|18.98240|32.6896|3.25|92902
|γ Hyi|3.78729|-74.2390|3.26|17637
|δ And|0.65546|30.8610|3.27|3086
|θ Oph|17.36683|-24.9995|3.27|84711
Skat|δ Aqr|22.91084|-15.8208|3.27|112776
|μ Lep|5.21553|-16.2055|3.29|24249
|ω Car|10.22896|-70.0379|3.29|49958
Edasich|ι Dra|15.41549|58.9661|3.29|75229
|HIP 51576|10.53374|-61.6853|3.30|51428
|α Dor|4.56660|-55.0450|3.30|21228
|γ Ara|17.42324|-56.3777|3.31|85008
Propus|η Gem|6.24796|22.5068|3.31|29582
|β Phe|1.10141|-46.7184|3.32|5154
|η Sco|17.20255|-43.2392|3.32|83885
|ν Oph|17.98378|-9.7736|3.32|87775
|ρ Per|3.08627|38.8403|3.32|14318
|τ Sgr|19.11567|-27.6704|3.32|93569
Megrez|δ UMa|12.25709|57.0326|3.32|59592
|α Ret|4.24040|-62.4739|3.33|19730
Chertan|θ Leo|11.23733|15.4296|3.33|54718
Azmidi|ξ Pup|7.82157|-24.8598|3.34|38062
|η Ori|5.40795|-2.3971|3.35|25218
Alzirr|ξ Gem|6.75482|12.8956|3.35|32276
Muscida|ο UMa|8.50443|60.7182|3.35|41586
Segin|ε Cas|1.90658|63.6701|3.35|8867
|δ Aql|19.42497|3.1148|3.36|95207
|ε Lup|15.37802|-44.6896|3.37|75035
Ashlesha|ε Hya|8.77959|6.4188|3.38|42990
Heze|ζ Vir|13.57822|-0.5958|3.38|66040
|HIP 50371|10.28472|-61.3323|3.39|50229
|ζ Cep|22.18091|58.2013|3.39|109146
Meissa|λ Ori|5.58563|9.9342|3.39|26142
Minelauva|δ Vir|12.92672|3.3975|3.39|62890
||17.17278|-15.7269|3.40|119131
Chamukuy|θ2 Tau|4.47771|15.8709|3.40|20842
|γ Phe|1.47276|-43.3182|3.41|6853
|ζ Lup|15.20476|-52.0992|3.41|74167
|η Cep|20.75481|61.8388|3.41|102091
|λ Tau|4.01134|12.4903|3.41|18677
|ν Cen|13.82508|-41.6877|3.41|67251
Homam|ζ Peg|22.69103|10.8314|3.41|111676
|β Pav|20.74931|-66.2032|3.42|102064
|η Lup|16.00204|-38.3967|3.42|78148
|μ Her|17.77432|27.7207|3.42|86705
Mothallah|α Tri|1.88470|29.5788|3.42|8777
|HIP 45080|9.18280|-58.9669|3.43|44952
|λ Aql|19.10415|-4.8826|3.43|93510
Adhafera|ζ Leo|10.27817|23.4173|3.43|50193
Tania Borealis|λ UMa|10.28495|42.9144|3.45|50230
|δ Boo|15.25838|33.3148|3.46|74438
|η Cet|1.14316|-10.1823|3.46|5353
|χ Car|7.94631|-52.9824|3.46|38713
Achird|η Cas|0.81826|57.8152|3.46|3814
|μ Cen|13.82694|-42.4737|3.47|67259
Kaffaljidhma|γ Cet|2.72168|3.2358|3.47|12673
|η Her|16.71493|38.9223|3.48|81583
|η Leo|10.12221|16.7627|3.48|49441
|α Tel|18.44956|-45.9685|3.49|90143
|ε Gru|22.80924|-51.3169|3.49|112263
|τ Cet|1.73448|-15.9375|3.49|8087
Alula Borealis|ν UMa|11.30798|33.0943|3.49|55055
Nekkar|β Boo|15.03244|40.3906|3.49|73327
Nganurganity|σ CMa|7.02865|-27.9348|3.49|33769
|ι Cep|22.82802|66.2004|3.50|112364
|κ CMa|6.83068|-32.5085|3.50|32672
Wasat|δ Gem|7.33538|21.9823|3.50|35453
|γ Sge|19.97929|19.4921|3.51|98026
Sadalbari|μ Peg|22.83338|24.6016|3.51|112389
|γ Vir|12.69417|-1.4492|3.52|118838
|ξ2 Sgr|18.96217|-21.1067|3.52|92793
|φ Vel|9.94771|-54.5678|3.52|48635
Biham|θ Peg|22.17000|6.1979|3.52|109081
Rana|δ Eri|3.72081|-9.7634|3.52|17336
Sheliak|β Lyr|18.83467|33.3627|3.52|92133
Subra|ο Leo|9.68584|9.8923|3.52|47373
Ain|ε Tau|4.47694|19.1804|3.53|20837
Tarf|β Cnc|8.27526|9.1855|3.53|40411
|μ Ser|15.82700|-3.4302|3.54|77280
|ξ Hya|11.55004|-31.8576|3.54|56174
|ξ Ser|17.62645|-15.3986|3.54|85998
|δ Pav|20.14516|-66.1821|3.55|98924
|ζ Lep|5.78259|-14.8219|3.55|27220
|ι Lup|14.32340|-46.0581|3.55|69773
|υ4 Eri|4.29824|-33.7983|3.55|19992
|χ Dra|18.35074|72.7328|3.55|89660
|δ Crt|11.32235|-14.7785|3.56|55118
|ι Cet|0.32380|-8.8239|3.56|1559
|φ Eri|2.27515|-51.5122|3.56|10578
Pipirima|μ2 Sco|16.87226|-38.0175|3.56|82294
|κ Gem|7.74079|24.3980|3.57|37633
|ρ Boo|14.53050|30.3714|3.57|70828
|φ1 Lup|15.36344|-36.2614|3.57|74948
Alkaphrah|κ UMa|9.06043|47.1565|3.57|44343
|λ Gem|7.30155|16.5404|3.58|35253
Algedi|α2 Cap|20.30090|-12.5449|3.58|99743
|γ Lep|5.74106|-22.4484|3.59|27006
|τ Ori|5.29344|-6.8444|3.59|24614
Ginan|ε Cru|12.35603|-60.4011|3.59|60075
Nembus|51 And|1.63321|48.6282|3.59|7593
Zavijava|β Vir|11.84492|1.7647|3.59|57584
|δ Ara|17.51832|-60.6838|3.60|85467
|θ Cet|1.40039|-8.1833|3.60|6523
|θ Gem|6.87982|33.9613|3.60|32932
|ο Vel|8.67155|-52.9219|3.60|42416
|υ Lib|15.61707|-28.1351|3.60|76235
|ψ Vel|9.51167|-40.4668|3.60|46518
|δ Mus|13.03776|-71.5489|3.61|63411
|η Pav|17.76222|-64.7239|3.61|86661
|λ Hya|10.17647|-12.3541|3.61|49700
|ο Tau|3.41355|9.0289|3.61|15861
Bharani|41 Ari|2.83306|27.2605|3.61|13176
|HIP 37819|7.75425|-37.9686|3.62|37711
|ζ2 Sco|16.90973|-42.3613|3.62|82477
|ο And|23.03202|42.3260|3.62|113366
Alpherg|η Psc|1.52473|15.3458|3.62|7083
Atlas|27 Tau|3.81937|24.0534|3.62|17805
|λ Mus|11.76014|-66.7288|3.63|57190
Rotanev|β Del|20.62582|14.5951|3.64|101442
|23 UMa|9.52545|63.0619|3.65|46600
|β Ser|15.76979|15.4218|3.65|76997
|ζ1 Aqr|22.48053|-0.0200|3.65|110614
|θ Ara|18.11052|-50.0915|3.65|88439
Prima Hyadum|γ Tau|4.32989|15.6276|3.65|20155
|τ Lib|15.64427|-29.7778|3.66|76365
Nusakan|β CrB|15.46382|29.1057|3.66|75466
|β Ind|20.91350|-58.4542|3.67|102895
Thuban|α Dra|14.07316|64.3758|3.67|68537
|88 Aqr|23.15744|-21.1724|3.68|113980
|α Pyx|8.72654|-33.1864|3.68|42709
|δ Sge|19.78980|18.5343|3.68|97056
|π4 Ori|4.85343|5.6051|3.68|22496
|HIP 47854|9.75412|-62.5079|3.69|47719
|χ Eri|1.93256|-51.6089|3.69|8989
Fulu|ζ Cas|0.61619|53.8969|3.69|2914
Nashira|γ Cap|21.66818|-16.6623|3.69|106642
Saclateni|ζ Aur|5.04130|41.0758|3.69|23398
Taiyangshou|χ UMa|11.76751|47.7794|3.69|57226
|γ Psc|23.28609|3.2823|3.70|114609
|ξ Her|17.96274|29.2479|3.70|87661
|τ4 Eri|3.32528|-21.7579|3.70|15436
|72 Oph|18.12250|9.5638|3.71|88494
|HIP 38414|7.87029|-40.5758|3.71|38304
|ε Ser|15.84694|4.4777|3.71|77386
|η Lep|5.94008|-14.1677|3.71|28032
|π5 Ori|4.90419|2.4407|3.71|22744
Alshain|β Aql|19.92189|6.4068|3.71|97725
|δ Aur|5.99211|54.2847|3.72|28287
|ξ Cyg|21.08218|43.9279|3.72|103725
Electra|17 Tau|3.74793|24.1133|3.72|17457
Ran|ε Eri|3.54885|-9.4583|3.72|16496
|109 Vir|14.77081|1.8929|3.73|71994
|λ Aqr|22.87691|-7.5796|3.73|112601
|ν Oct|21.69125|-77.3900|3.73|106746
|ξ Tau|3.45282|9.7327|3.73|16044
Grumium|ξ Dra|17.89213|56.8726|3.73|87314
|γ Her|16.36534|19.1531|3.74|79928
|τ Cyg|21.24652|38.0453|3.74|104549
Baten Kaitos|ζ Cet|1.85768|-10.3350|3.74|8628
|HIP 44511|9.06925|-47.0977|3.75|44383
|γ Oph|17.79821|2.7073|3.75|86839
|α Lac|22.52152|50.2825|3.76|110822
|β Dor|5.56042|-62.4898|3.76|26004
|β Mon|6.48030|-7.0331|3.76|30794
|δ Lep|5.85536|-20.8791|3.76|27585
|ι2 Cyg|19.49510|51.7298|3.76|95554
|ο Sgr|19.07805|-21.7415|3.76|93388
|HIP 42570|8.67710|-46.6487|3.77|42452
|β Vol|8.42895|-66.1369|3.77|41195
|ζ Cap|21.44445|-22.4113|3.77|105540
|η Ara|16.82976|-59.0414|3.77|82112
|ι Peg|22.11685|25.3451|3.77|108830
|ν Per|3.75323|42.5785|3.77|17487
|σ Ori|5.64577|-2.6001|3.77|26484
Miram|η Per|2.84495|55.8955|3.77|13234
Secunda Hyadum|δ1 Tau|4.38225|17.5425|3.77|20405
Sualocin|α Del|20.66063|15.9121|3.77|101629
|HIP 53253|10.89156|-58.8532|3.78|53099
|γ2 Vol|7.14579|-70.4989|3.78|34389
|ζ Boo|14.68582|13.7283|3.78|71569
|ι Gem|7.42878|27.7981|3.78|35946
|υ UMa|9.84987|59.0387|3.78|48182
Albali|ε Aqr|20.79460|-9.4958|3.78|102287
Misam|κ Per|3.15826|44.8575|3.79|14632
Praecipua|46 LMi|10.88853|34.2149|3.79|53075
|31 Cyg|20.22720|46.7413|3.80|99356
|HIP 37229|7.64719|-26.8038|3.80|37124
|δ Ser|15.58004|10.5389|3.80|76044
|κ Cyg|19.28504|53.3685|3.80|94484
Dalim|α For|3.20125|-28.9876|3.80|14843
|HIP 51232|10.46465|-58.7394|3.81|51087
|γ CrB|15.71238|26.2956|3.81|76716
|λ And|23.62606|46.4582|3.81|116218
Theemin|υ2 Eri|4.59251|-30.5623|3.81|21340
|38 Lyn|9.31407|36.8026|3.82|45557
|ι Her|17.65775|46.0063|3.82|86148
Alrescha|α Psc|2.03412|2.7638|3.82|9467
Giausar|λ Dra|11.52341|69.3311|3.82|56044
Marfik|λ Oph|16.51523|1.9839|3.82|80637
|α Aps|14.79770|-79.0448|3.83|72144
|μ Hya|10.43484|-16.8363|3.83|50924
|φ Cen|13.97119|-42.1008|3.83|68027
|HIP 43783|8.91746|-60.6446|3.84|43659
|HIP 51986|10.62172|-48.2256|3.84|51837
|β Ret|3.73659|-64.8069|3.84|17398
|γ Mus|12.54113|-72.1330|3.84|61008
|ε Dra|19.80285|70.2679|3.84|97124
|θ1 Tau|4.47625|15.9622|3.84|20833
|ο Her|18.12571|28.7625|3.84|88517
|ρ Leo|10.54685|9.3066|3.84|51475
Atik|ο Per|3.73865|32.2882|3.84|17406
Polis|μ Sgr|18.22939|-21.0588|3.84|89064
|109 Her|18.39497|21.7698|3.85|89860
|HIP 50191|10.24561|-42.1219|3.85|50050
|α Hor|4.23336|-42.2944|3.85|19697
|α Sct|18.58678|-8.2441|3.85|90835
|β Pic|5.78808|-51.0665|3.85|27253
|γ Ser|15.94088|15.6616|3.85|77836
|δ Col|6.36856|-33.4364|3.85|30204
|κ Dra|12.55806|69.7882|3.85|61088
|τ Cen|12.62839|-48.5413|3.85|61429
|γ Aps|16.55761|-78.8971|3.86|80819
|δ TrA|16.25730|-63.6857|3.86|79423
|ε Col|5.52021|-35.4705|3.86|25794
|θ Her|17.93755|37.2505|3.86|87537
|μ And|0.94588|38.4993|3.86|4426
Sadachbia|γ Aqr|22.36094|-1.3873|3.86|110049
Sceptrum|53 Eri|4.63634|-14.3040|3.86|21541
|HIP 43023|8.76712|-46.0415|3.87|42904
|η Aql|19.87455|1.0057|3.87|97493
|μ Vir|14.71767|-5.6582|3.87|71731
|υ1 Cen|13.97799|-44.8036|3.87|68064
Iklil|ρ Sco|15.94808|-29.2141|3.87|77868
Maia|20 Tau|3.76378|24.3677|3.87|17532
|ε Phe|0.15684|-45.7474|3.88|763
|ι Gru|23.17264|-45.2467|3.88|114059
|κ1 Lup|15.19892|-48.7378|3.88|74148
Mesarthim|γ2 Ari|1.89217|19.2939|3.88|8813
Rasalas|μ Leo|9.87940|26.0070|3.88|48318
|η Cyg|19.93844|35.0834|3.89|97799
|θ Hya|9.23940|2.3143|3.89|45204
|ο1 CMa|6.90221|-24.1842|3.89|33065
Azha|η Eri|2.94046|-8.8981|3.89|13667
Zaniah|η Vir|12.33177|-0.6668|3.89|59945
|HIP 65936|13.51741|-39.4073|3.90|65729
|π Cen|11.35012|-54.4910|3.90|55260
Ukdah|ι Hya|9.66427|-1.1428|3.90|47297
|HIP 41307|8.42768|-3.9064|3.91|41190
|ν Tau|4.05261|5.9893|3.91|18860
|π Lup|15.08530|-47.0512|3.91|73579
|σ Cen|12.46733|-50.2306|3.91|60635
|τ Her|16.32901|46.3134|3.91|79750
Zubenelhakrabi|γ Lib|15.59211|-14.7895|3.91|76100
|ε Her|17.00483|30.9264|3.92|82952
|ρ1 Sgr|19.36121|-17.8472|3.92|94873
Kitalpha|α Equ|21.26373|5.2478|3.92|104649
|67 Oph|18.01075|2.9316|3.93|87920
|HIP 54463|11.14316|-58.9750|3.93|54304
|δ Phe|1.52085|-49.0727|3.93|7068
|ζ Vol|7.69700|-72.6061|3.93|37397
|κ Phe|0.43672|-43.6798|3.93|2069
|ν Eri|4.60532|-3.3525|3.93|21391
|τ Per|2.90429|52.7625|3.93|13497
|ω1 Sco|16.11345|-20.6692|3.93|78693
|3 Pup|7.73013|-28.9548|3.94|37570
|α Mon|7.68745|-9.5511|3.94|37340
|ν Cyg|20.95289|41.1671|3.94|103081
Asellus Australis|δ Cnc|8.74475|18.1543|3.94|42792
Wurren|ζ Phe|1.13974|-55.2458|3.94|5337
|50 Cas|2.05727|72.4213|3.95|9577
|ζ UMa|13.39900|54.9205|3.95|118887
|ν2 CMa|6.61140|-19.2559|3.95|31512
|32 Cyg|20.25787|47.7142|3.96|99529
|48 Per|4.14436|47.7125|3.96|19296
|98 Aqr|23.38284|-20.1006|3.96|115073
|HIP 44248|9.01069|41.7829|3.96|44120
|HIP 45101|9.18798|-62.3170|3.96|44972
|η Col|5.98578|-42.8151|3.96|28256
Arkab Prior|β1 Sgr|19.37730|-44.4590|3.96|94946
Rukbat|α Sgr|19.39810|-40.6159|3.96|95052
|β Pyx|8.66837|-35.3084|3.97|42396
|δ Vol|7.28051|-67.9572|3.97|35132
|δ1 Gru|22.48783|-43.4956|3.97|110650
|ε Pav|20.00984|-72.9105|3.97|98184
|λ Peg|22.77552|23.5657|3.97|112084
|ν Aur|5.85817|39.1485|3.97|27604
|ρ Cen|12.19420|-52.3685|3.97|59267
|χ Lup|15.84932|-33.6272|3.97|77398
Beemim|43 Eri|4.40061|-34.0168|3.97|20483
|ρ Cyg|21.56635|45.5918|3.98|106139
Menkib|ξ Per|3.98275|35.7910|3.98|18567
|HIP 50954|10.40659|-74.0316|3.99|50809
|γ Mon|6.24759|-6.2748|3.99|29578
|γ Tuc|23.29050|-58.2357|3.99|114634
|υ Cet|2.00008|-21.0778|3.99|9328
Alcor|80 UMa|13.42041|54.9880|3.99|65272
"""
}

// MARK: - Sky math

enum SkyMath {
    static let deg = Double.pi / 180.0

    /// Local sidereal time in degrees (0..360).
    static func localSiderealTimeDeg(date: Date, longitudeDeg: Double) -> Double {
        let jd = date.timeIntervalSince1970 / 86400.0 + 2440587.5
        var lst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + longitudeDeg
        lst = lst.truncatingRemainder(dividingBy: 360.0)
        if lst < 0 { lst += 360.0 }
        return lst
    }

    /// Unit vector of a star in the CoreMotion reference frame
    /// (x = true north, y = west, z = up).
    static func refVector(raHours: Double, decDeg: Double, latDeg: Double, lstDeg: Double) -> SIMD3<Double> {
        let h = (lstDeg - raHours * 15.0) * deg      // hour angle
        let d = decDeg * deg
        let phi = latDeg * deg
        let east = -cos(d) * sin(h)
        let north = sin(d) * cos(phi) - cos(d) * sin(phi) * cos(h)
        let up = sin(d) * sin(phi) + cos(d) * cos(phi) * cos(h)
        return SIMD3<Double>(north, -east, up)
    }

    /// Altitude and azimuth (degrees, azimuth 0 = north, 90 = east) of a reference-frame vector.
    static func altAz(_ v: SIMD3<Double>) -> (alt: Double, az: Double) {
        let north = v.x
        let east = -v.y
        let up = v.z
        let alt = asin(max(-1.0, min(1.0, up)))
        var az = atan2(east, north)
        if az < 0 { az += 2.0 * Double.pi }
        return (alt / deg, az / deg)
    }

    /// RA (hours) and Dec (degrees) for an altitude/azimuth.
    static func raDec(altDeg: Double, azDeg: Double, latDeg: Double, lstDeg: Double) -> (ra: Double, dec: Double) {
        let alt = altDeg * deg
        let az = azDeg * deg
        let phi = latDeg * deg
        let sinDec = sin(alt) * sin(phi) + cos(alt) * cos(phi) * cos(az)
        let decR = asin(max(-1.0, min(1.0, sinDec)))
        let ha = atan2(-sin(az) * cos(alt),
                       sin(alt) * cos(phi) - cos(alt) * sin(phi) * cos(az))
        var raDeg = lstDeg - ha / deg
        raDeg = raDeg.truncatingRemainder(dividingBy: 360.0)
        if raDeg < 0 { raDeg += 360.0 }
        return (raDeg / 15.0, decR / deg)
    }

    /// Angle between two unit vectors, degrees.
    static func angleDeg(_ a: SIMD3<Double>, _ b: SIMD3<Double>) -> Double {
        let c = max(-1.0, min(1.0, simd_dot(a, b)))
        return acos(c) / deg
    }

    /// Dot size on screen for a magnitude.
    static func dotRadius(mag: Double) -> Double {
        return max(1.2, 4.5 - 0.8 * mag)
    }
}

/// Turns reference-frame directions into screen points for the back camera
/// shown full screen with resizeAspectFill, phone held in portrait.
struct Projector {
    let qInv: simd_quatd
    let f: Double     // focal length in screen points
    let cx: Double
    let cy: Double

    /// - longAxisFOVDeg: AVCaptureDevice.activeFormat.videoFieldOfView (spans the sensor's long side,
    ///   which is the screen's vertical axis in portrait).
    /// - sensorAspect: long side / short side of the camera image (4:3 -> 1.333).
    init(attitude: simd_quatd, width: Double, height: Double, longAxisFOVDeg: Double, sensorAspect: Double) {
        qInv = attitude.inverse
        cx = width / 2.0
        cy = height / 2.0
        // In portrait the image is (short x long). Aspect fill scales it until it covers the view,
        // so the displayed image height is the larger of the view height and width * aspect.
        let displayedHeight = max(height, width * sensorAspect)
        let halfFOV = longAxisFOVDeg * Double.pi / 360.0
        f = (displayedHeight / 2.0) / tan(halfFOV)
    }

    /// Screen point for a reference-frame unit vector, or nil if it is behind the camera.
    func project(_ ref: SIMD3<Double>) -> CGPoint? {
        let d = qInv.act(ref)                 // device frame: x right, y up, z out of screen
        if d.z > -1e-6 { return nil }          // back camera looks along -z
        let x = cx + f * d.x / (-d.z)
        let y = cy - f * d.y / (-d.z)
        return CGPoint(x: x, y: y)
    }
}

// MARK: - Star notes (data + tap picking)

/// One saved note about a star.
struct StarNote: Codable, Equatable, Sendable {
    var starName: String      // label at save time, so the list still reads well
    var text: String
    var created: Date
    var updated: Date
    var latitude: Double?     // where you were when you saved it (if known)
    var longitude: Double?
    // Ring/label color (sRGB, 0...1). Optional so notes saved before colors existed
    // still load; those show the default cyan.
    var colorR: Double? = nil
    var colorG: Double? = nil
    var colorB: Double? = nil

    /// The note's chosen color, or nil if it has none (use the default).
    var rgb: NoteRGB? {
        get {
            guard let r = colorR, let g = colorG, let b = colorB else { return nil }
            return NoteRGB(r: r, g: g, b: b)
        }
        set {
            colorR = newValue?.r
            colorG = newValue?.g
            colorB = newValue?.b
        }
    }
}

/// A plain RGB color (sRGB, each 0...1) that can be saved with a note.
struct NoteRGB: Equatable, Sendable {
    let r: Double
    let g: Double
    let b: Double

    init(r: Double, g: Double, b: Double) {
        func clamp(_ v: Double) -> Double { v.isFinite ? min(1, max(0, v)) : 0 }
        self.r = clamp(r)
        self.g = clamp(g)
        self.b = clamp(b)
    }
}

/// Turns the notes dictionary into bytes for UserDefaults and back.
enum NoteCodec {
    static func encode(_ notes: [String: StarNote]) -> Data? {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return try? encoder.encode(notes)
    }

    static func decode(_ data: Data) -> [String: StarNote] {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode([String: StarNote].self, from: data)) ?? [:]
    }
}

/// A star drawn on screen this frame.
struct StarMark {
    let star: Star
    let point: CGPoint
    let radius: Double
    let label: String   // empty = dot only
    let hasNote: Bool
    var noteRGB: NoteRGB? = nil   // the note's color, nil = default cyan
}

enum StarPicker {
    /// Index of the mark the user meant to tap, or nil if none is within `radius` points.
    /// The closest mark wins; marks within `tieSlop` points of the closest count as a tie,
    /// and ties go to stars with a note, then named stars, then brighter stars.
    static func pick(_ marks: [StarMark], at p: CGPoint, radius: Double = 36, tieSlop: Double = 8) -> Int? {
        var dists: [(index: Int, d: Double)] = []
        for (i, m) in marks.enumerated() {
            let dx = Double(m.point.x - p.x)
            let dy = Double(m.point.y - p.y)
            let d = (dx * dx + dy * dy).squareRoot()
            if d <= radius { dists.append((i, d)) }
        }
        guard let closest = dists.map({ $0.d }).min() else { return nil }
        let ties = dists.filter { $0.d <= closest + tieSlop }
        let best = ties.min { a, b in
            let ma = marks[a.index], mb = marks[b.index]
            if ma.hasNote != mb.hasNote { return ma.hasNote }
            let na = !ma.star.name.isEmpty, nb = !mb.star.name.isEmpty
            if na != nb { return na }
            if ma.star.mag != mb.star.mag { return ma.star.mag < mb.star.mag }
            return a.d < b.d
        }
        return best?.index
    }
}

// MARK: - Motion + location

struct NearestStar: Equatable {
    let name: String
    let mag: Double
    let distanceDeg: Double
}

@MainActor
final class SkyModel: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var attitude = simd_quatd(ix: 0, iy: 0, iz: 0, r: 1)
    @Published var hasMotion = false
    @Published var hasLocation = false
    @Published var locationDenied = false
    @Published var latitude = 0.0
    @Published var longitude = 0.0
    @Published var lstDeg = 0.0
    @Published var altitude = 0.0
    @Published var azimuth = 0.0
    @Published var ra = 0.0
    @Published var dec = 0.0
    @Published var nearest: NearestStar? = nil
    @Published var needsCalibration = false
    @Published var azimuthOffsetDeg = 0.0   // manual heading nudge, + turns the reported heading east

    private let motion = CMMotionManager()
    private let locationManager = CLLocationManager()
    private var timer: AnyCancellable?

    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    func start() {
        locationManager.requestWhenInUseAuthorization()
        locationManager.startUpdatingLocation()

        if motion.isDeviceMotionAvailable &&
            CMMotionManager.availableAttitudeReferenceFrames().contains(.xTrueNorthZVertical) {
            motion.deviceMotionUpdateInterval = 1.0 / 30.0
            motion.showsDeviceMovementDisplay = true   // lets iOS show its own calibration prompt
            motion.startDeviceMotionUpdates(using: .xTrueNorthZVertical)
        }

        timer = Timer.publish(every: 1.0 / 30.0, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in self?.tick() }
    }

    func stop() {
        timer?.cancel()
        timer = nil
        motion.stopDeviceMotionUpdates()
        locationManager.stopUpdatingLocation()
    }

    private func tick() {
        lstDeg = SkyMath.localSiderealTimeDeg(date: Date(), longitudeDeg: longitude)

        guard let dm = motion.deviceMotion else { return }
        let cq = dm.attitude.quaternion
        let raw = simd_quatd(ix: cq.x, iy: cq.y, iz: cq.z, r: cq.w)
        // Heading nudge: rotate about the vertical axis so azimuth increases by azimuthOffsetDeg.
        let nudge = simd_quatd(angle: -azimuthOffsetDeg * SkyMath.deg, axis: SIMD3<Double>(0, 0, 1))
        let q = nudge * raw
        attitude = q
        hasMotion = true

        let acc = dm.magneticField.accuracy
        let poor = (acc == .uncalibrated || acc == .low)
        if poor != needsCalibration { needsCalibration = poor }

        let center = q.act(SIMD3<Double>(0, 0, -1))   // back camera direction
        let aa = SkyMath.altAz(center)
        altitude = aa.alt
        azimuth = aa.az

        guard hasLocation else { return }
        let rd = SkyMath.raDec(altDeg: aa.alt, azDeg: aa.az, latDeg: latitude, lstDeg: lstDeg)
        ra = rd.ra
        dec = rd.dec

        var bestStar: Star? = nil
        var bestAngle = 1000.0
        for star in StarCatalog.stars {
            let v = SkyMath.refVector(raHours: star.ra, decDeg: star.dec, latDeg: latitude, lstDeg: lstDeg)
            let a = SkyMath.angleDeg(center, v)
            if a < bestAngle {
                bestAngle = a
                bestStar = star
            }
        }
        if let s = bestStar {
            nearest = NearestStar(name: s.displayName, mag: s.mag, distanceDeg: bestAngle)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let l = locations.last else { return }
        let la = l.coordinate.latitude
        let lo = l.coordinate.longitude
        Task { @MainActor in
            self.latitude = la
            self.longitude = lo
            self.hasLocation = true
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        let denied = (status == .denied || status == .restricted)
        Task { @MainActor in
            self.locationDenied = denied
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Ignore transient errors; CoreLocation keeps trying.
    }
}

// MARK: - Camera

@MainActor
final class CameraManager: ObservableObject {
    let session = AVCaptureSession()
    @Published var status: AVAuthorizationStatus = AVCaptureDevice.authorizationStatus(for: .video)
    @Published var longAxisFOVDeg = 67.0      // replaced with the real value once the camera opens
    @Published var sensorAspect = 4.0 / 3.0

    private var configured = false
    private let sessionQueue = DispatchQueue(label: "startagger.camera")

    func start() {
        let current = AVCaptureDevice.authorizationStatus(for: .video)
        status = current
        switch current {
        case .authorized:
            configureAndRun()
        case .notDetermined:
            Task { @MainActor in
                let granted = await AVCaptureDevice.requestAccess(for: .video)
                self.status = granted ? .authorized : .denied
                if granted { self.configureAndRun() }
            }
        default:
            break
        }
    }

    func stop() {
        let s = session
        sessionQueue.async {
            if s.isRunning { s.stopRunning() }
        }
    }

    private func configureAndRun() {
        if !configured {
            session.beginConfiguration()
            // .photo uses the full 4:3 sensor, so the field of view matches videoFieldOfView.
            if session.canSetSessionPreset(.photo) {
                session.sessionPreset = .photo
            }
            if let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
               let input = try? AVCaptureDeviceInput(device: device),
               session.canAddInput(input) {
                session.addInput(input)
                session.commitConfiguration()
                configured = true

                let format = device.activeFormat
                let fov = Double(format.videoFieldOfView)
                if fov > 1 { longAxisFOVDeg = fov }
                let dims = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
                let w = Double(dims.width)
                let h = Double(dims.height)
                if w > 0 && h > 0 {
                    sensorAspect = max(w, h) / min(w, h)
                }
            } else {
                session.commitConfiguration()
                return
            }
        }
        let s = session
        sessionQueue.async {
            if !s.isRunning { s.startRunning() }   // slow call, kept off the main thread
        }
    }
}

final class PreviewUIView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }

    var previewLayer: AVCaptureVideoPreviewLayer {
        return layer as! AVCaptureVideoPreviewLayer
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        // Keep the preview upright in portrait so the overlay lines up.
        guard let connection = previewLayer.connection else { return }
        if #available(iOS 17.0, *) {
            if connection.isVideoRotationAngleSupported(90) {
                connection.videoRotationAngle = 90
            }
        } else {
            if connection.isVideoOrientationSupported {
                connection.videoOrientation = .portrait
            }
        }
    }
}

struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> PreviewUIView {
        let view = PreviewUIView()
        view.backgroundColor = .black
        view.previewLayer.session = session
        view.previewLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ uiView: PreviewUIView, context: Context) {
        uiView.setNeedsLayout()
    }
}

// MARK: - Note storage

@MainActor
final class NoteStore: ObservableObject {
    @Published private(set) var notes: [String: StarNote] = [:]
    private let defaultsKey = "StarTagger.notes.v1"

    init() {
        if let data = UserDefaults.standard.data(forKey: defaultsKey) {
            notes = NoteCodec.decode(data)
        }
    }

    func note(for star: Star) -> StarNote? {
        return notes[star.noteKey]
    }

    func save(_ text: String, for star: Star, color: NoteRGB?, latitude: Double?, longitude: Double?) {
        let now = Date()
        var note = notes[star.noteKey] ?? StarNote(starName: star.displayName, text: "",
                                                  created: now, updated: now,
                                                  latitude: nil, longitude: nil)
        note.starName = star.displayName
        note.text = text
        note.updated = now
        if let c = color {
            note.rgb = c
        }
        if let la = latitude, let lo = longitude {
            note.latitude = la
            note.longitude = lo
        }
        notes[star.noteKey] = note
        persist()
    }

    func delete(key: String) {
        notes[key] = nil
        persist()
    }

    private func persist() {
        if let data = NoteCodec.encode(notes) {
            UserDefaults.standard.set(data, forKey: defaultsKey)
        }
    }
}

// MARK: - Note colors

/// Default ring/label color for noted stars (and for new notes in the editor).
var defaultNoteColor: Color { return .cyan }

extension NoteRGB {
    /// RGB of a SwiftUI color, or nil if it can't be expressed as RGB.
    init?(_ color: Color) {
        var r: CGFloat = 0
        var g: CGFloat = 0
        var b: CGFloat = 0
        var a: CGFloat = 0
        guard UIColor(color).getRed(&r, green: &g, blue: &b, alpha: &a) else { return nil }
        self.init(r: Double(r), g: Double(g), b: Double(b))
    }

    var color: Color {
        return Color(red: r, green: g, blue: b)
    }
}

extension StarNote {
    /// The color to draw this note's star with.
    var displayColor: Color {
        return rgb?.color ?? defaultNoteColor
    }
}

/// The star whose note editor is open (used with .sheet(item:)).
struct NoteTarget: Identifiable {
    let star: Star
    var id: String { star.noteKey }
}

// MARK: - Note screens

struct NoteEditorView: View {
    let star: Star
    let existing: StarNote?
    let latitude: Double?
    let longitude: Double?
    @ObservedObject var store: NoteStore
    @Environment(\.dismiss) private var dismiss
    @State private var text: String
    @State private var color: Color

    init(star: Star, existing: StarNote?, latitude: Double?, longitude: Double?, store: NoteStore) {
        self.star = star
        self.existing = existing
        self.latitude = latitude
        self.longitude = longitude
        self.store = store
        _text = State(initialValue: existing?.text ?? "")
        _color = State(initialValue: existing?.displayColor ?? defaultNoteColor)
    }

    private var trimmed: String {
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        Form {
            Section("Star") {
                Text(star.displayName).font(.headline)
                Text(String(format: "Magnitude %.2f", star.mag))
                Text(String(format: "RA %.3f h   Dec %+.2f°", star.ra, star.dec))
                    .font(.system(.body, design: .monospaced))
            }
            Section("Note") {
                TextEditor(text: $text)
                    .frame(minHeight: 160)
            }
            Section("Color") {
                ColorPicker("Ring color", selection: $color, supportsOpacity: false)
            }
            if let n = existing {
                Section("Saved") {
                    Text("Created " + n.created.formatted(date: .abbreviated, time: .shortened))
                    Text("Updated " + n.updated.formatted(date: .abbreviated, time: .shortened))
                    if let la = n.latitude, let lo = n.longitude {
                        Text(String(format: "From %.4f, %.4f", la, lo))
                    }
                }
                Section {
                    Button("Delete note", role: .destructive) {
                        store.delete(key: star.noteKey)
                        dismiss()
                    }
                }
            }
        }
        .navigationTitle(star.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") {
                    store.save(trimmed, for: star, color: NoteRGB(color),
                               latitude: latitude, longitude: longitude)
                    dismiss()
                }
                .disabled(trimmed.isEmpty)
            }
        }
    }
}

struct NotesListView: View {
    @ObservedObject var store: NoteStore
    let latitude: Double?
    let longitude: Double?
    @Environment(\.dismiss) private var dismiss

    private var sortedKeys: [String] {
        return store.notes.keys.sorted { a, b in
            let da = store.notes[a]?.updated ?? Date.distantPast
            let db = store.notes[b]?.updated ?? Date.distantPast
            return da > db
        }
    }

    var body: some View {
        NavigationStack {
            List {
                if store.notes.isEmpty {
                    Text("No notes yet. Tap a star on the camera view to add one.")
                        .foregroundColor(.secondary)
                }
                ForEach(sortedKeys, id: \.self) { key in
                    if let note = store.notes[key] {
                        if let star = StarCatalog.byNoteKey[key] {
                            NavigationLink {
                                NoteEditorView(star: star, existing: note,
                                               latitude: latitude, longitude: longitude,
                                               store: store)
                            } label: {
                                NoteRow(note: note)
                            }
                        } else {
                            NoteRow(note: note)
                        }
                    }
                }
                .onDelete { offsets in
                    let keys = sortedKeys
                    for i in offsets where i < keys.count {
                        store.delete(key: keys[i])
                    }
                }
            }
            .navigationTitle("Star notes")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

struct NoteRow: View {
    let note: StarNote

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 6) {
                Circle()
                    .fill(note.displayColor)
                    .frame(width: 10, height: 10)
                Text(note.starName).font(.headline)
            }
            Text(note.text)
                .lineLimit(2)
                .foregroundColor(.secondary)
            Text(note.updated.formatted(date: .abbreviated, time: .shortened))
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }
}

// MARK: - Overlay

struct ContentView: View {
    @StateObject private var sky = SkyModel()
    @StateObject private var camera = CameraManager()
    @StateObject private var notes = NoteStore()
    @State private var showUnnamed = true
    @State private var editing: NoteTarget? = nil
    @State private var showNotesList = false
    @State private var tapMessage: String? = nil
    @State private var tapMessageID = 0

    private var currentLat: Double? { sky.hasLocation ? sky.latitude : nil }
    private var currentLon: Double? { sky.hasLocation ? sky.longitude : nil }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if camera.status == .authorized {
                CameraPreview(session: camera.session)
                    .ignoresSafeArea()
            }

            // Star overlay. Tapping it picks the nearest drawn star.
            GeometryReader { geo in
                let marks = computeMarks(size: geo.size)
                Canvas { ctx, size in
                    drawOverlay(ctx: &ctx, size: size, marks: marks)
                }
                .contentShape(Rectangle())
                .onTapGesture { location in
                    handleTap(at: location, marks: marks)
                }
            }
            .ignoresSafeArea()

            if camera.status != .authorized {
                cameraMessage
            }

            VStack(spacing: 8) {
                topHints
                Spacer()
                bottomBar
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
        }
        .onAppear {
            camera.start()
            sky.start()
        }
        .onDisappear {
            camera.stop()
            sky.stop()
        }
        .sheet(item: $editing) { target in
            NavigationStack {
                NoteEditorView(star: target.star, existing: notes.note(for: target.star),
                               latitude: currentLat, longitude: currentLon, store: notes)
            }
        }
        .sheet(isPresented: $showNotesList) {
            NotesListView(store: notes, latitude: currentLat, longitude: currentLon)
        }
    }

    private func handleTap(at location: CGPoint, marks: [StarMark]) {
        if let i = StarPicker.pick(marks, at: location) {
            editing = NoteTarget(star: marks[i].star)
        } else if !marks.isEmpty {
            showTapMessage("No star there. Tap right on a dot to add a note.")
        }
    }

    private func showTapMessage(_ text: String) {
        tapMessageID += 1
        let myID = tapMessageID
        tapMessage = text
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            if tapMessageID == myID { tapMessage = nil }
        }
    }

    private func computeMarks(size: CGSize) -> [StarMark] {
        guard sky.hasMotion, sky.hasLocation, size.width > 0, size.height > 0 else { return [] }
        let w = Double(size.width)
        let h = Double(size.height)
        let projector = Projector(attitude: sky.attitude, width: w, height: h,
                                  longAxisFOVDeg: camera.longAxisFOVDeg,
                                  sensorAspect: camera.sensorAspect)
        let lat = sky.latitude
        let lst = sky.lstDeg
        let saved = notes.notes
        let margin = 40.0
        var marks: [StarMark] = []
        for star in StarCatalog.stars {
            let note = saved[star.noteKey]
            let hasNote = note != nil
            if star.name.isEmpty && !showUnnamed && !hasNote { continue }
            let v = SkyMath.refVector(raHours: star.ra, decDeg: star.dec, latDeg: lat, lstDeg: lst)
            if v.z < -0.01 { continue }   // below the horizon
            guard let p = projector.project(v) else { continue }
            let px = Double(p.x)
            let py = Double(p.y)
            if px < -margin || px > w + margin || py < -margin || py > h + margin { continue }
            let label = hasNote ? star.title : star.name
            marks.append(StarMark(star: star, point: p, radius: SkyMath.dotRadius(mag: star.mag),
                                  label: label, hasNote: hasNote, noteRGB: note?.rgb))
        }
        return marks
    }

    private func drawOverlay(ctx: inout GraphicsContext, size: CGSize, marks: [StarMark]) {
        let cx = size.width / 2
        let cy = size.height / 2

        // Center crosshair
        var cross = Path()
        cross.move(to: CGPoint(x: cx - 22, y: cy))
        cross.addLine(to: CGPoint(x: cx - 6, y: cy))
        cross.move(to: CGPoint(x: cx + 6, y: cy))
        cross.addLine(to: CGPoint(x: cx + 22, y: cy))
        cross.move(to: CGPoint(x: cx, y: cy - 22))
        cross.addLine(to: CGPoint(x: cx, y: cy - 6))
        cross.move(to: CGPoint(x: cx, y: cy + 6))
        cross.addLine(to: CGPoint(x: cx, y: cy + 22))
        ctx.stroke(cross, with: .color(.red), lineWidth: 1.5)

        for m in marks {
            let r = CGFloat(m.radius)
            let dot = CGRect(x: m.point.x - r, y: m.point.y - r, width: 2 * r, height: 2 * r)
            if m.label.isEmpty {
                ctx.fill(Path(ellipseIn: dot), with: .color(Color.white.opacity(0.7)))
            } else {
                ctx.fill(Path(ellipseIn: dot), with: .color(.white))
                let ring = dot.insetBy(dx: -5, dy: -5)
                // Stars with a note get a ring in the note's color (default cyan)
                // and a note icon after the name.
                let color: Color = m.hasNote ? (m.noteRGB?.color ?? defaultNoteColor) : .yellow
                ctx.stroke(Path(ellipseIn: ring), with: .color(color), lineWidth: m.hasNote ? 2.0 : 1.2)
                var label = Text(m.label)
                if m.hasNote {
                    label = Text("\(m.label) \(Image(systemName: "note.text"))")
                }
                let styled = label
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(color)
                ctx.draw(styled, at: CGPoint(x: ring.maxX + 3, y: m.point.y), anchor: .leading)
            }
        }
    }

    @ViewBuilder
    private var topHints: some View {
        VStack(spacing: 6) {
            if sky.needsCalibration {
                hint("Compass needs calibrating: wave the phone in a figure-8")
            }
            if sky.locationDenied {
                hint("Location is off. Turn it on in Settings for this app.")
            } else if !sky.hasLocation {
                hint("Getting your location…")
            }
            if let msg = tapMessage {
                hint(msg)
            }
        }
    }

    private func hint(_ text: String) -> some View {
        Text(text)
            .font(.footnote)
            .foregroundColor(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Color.orange.opacity(0.85))
            .cornerRadius(8)
    }

    private var bottomBar: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(String(format: "Alt %6.1f°   Az %6.1f°", sky.altitude, sky.azimuth))
            if sky.hasLocation {
                Text(String(format: "RA %6.3f h   Dec %+6.2f°", sky.ra, sky.dec))
            }
            if let n = sky.nearest {
                Text("Nearest: " + n.name)
                    .lineLimit(1)
                Text(String(format: "  mag %.2f, %.1f° from center", n.mag, n.distanceDeg))
            }
            HStack {
                Text("Heading nudge")
                Slider(value: $sky.azimuthOffsetDeg, in: -20...20, step: 0.5)
                Text(String(format: "%+5.1f°", sky.azimuthOffsetDeg))
                Button("0") { sky.azimuthOffsetDeg = 0 }
                    .buttonStyle(.bordered)
            }
            Toggle("Show unnamed stars", isOn: $showUnnamed)
            HStack {
                Button {
                    showNotesList = true
                } label: {
                    Label("Notes (\(notes.notes.count))", systemImage: "note.text")
                }
                .buttonStyle(.bordered)
                Spacer()
                Text("Tap a star to add a note")
                    .foregroundColor(Color.white.opacity(0.7))
            }
        }
        .font(.system(.footnote, design: .monospaced))
        .foregroundColor(.white)
        .tint(.yellow)
        .padding(12)
        .background(Color.black.opacity(0.6))
        .cornerRadius(12)
    }

    @ViewBuilder
    private var cameraMessage: some View {
        if camera.status == .notDetermined {
            Text("Asking for camera access…")
                .foregroundColor(.white)
        } else {
            VStack(spacing: 12) {
                Text("Camera access is off.\nTurn it on in Settings to see the sky behind the star labels.")
                    .multilineTextAlignment(.center)
                    .foregroundColor(.white)
                Button("Open Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                }
                .buttonStyle(.borderedProminent)
            }
            .padding()
        }
    }
}

