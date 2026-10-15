// Trouve une sortie son de macOS par son nom et affiche son identifiant
// CoreAudio (UID), celui qu'OBS range dans MonitoringDeviceId.
//
//   swift son.swift "BMD HDMI"     l'UID de la sortie, code 1 si absente
//   swift son.swift                toutes les sorties : UID, tabulation, nom
//
// L'UID de la sortie HDMI peut changer d'un Mac ou d'un câble à l'autre :
// obs.sh le relève au moment de lancer OBS plutôt que de le figer.

import CoreAudio
import Foundation

func propriete<T>(_ objet: AudioObjectID, _ selecteur: AudioObjectPropertySelector,
                  _ portee: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal,
                  _ vide: T) -> [T] {
    var adresse = AudioObjectPropertyAddress(mSelector: selecteur, mScope: portee,
                                             mElement: kAudioObjectPropertyElementMain)
    var taille: UInt32 = 0
    guard AudioObjectGetPropertyDataSize(objet, &adresse, 0, nil, &taille) == noErr, taille > 0 else { return [] }
    var valeurs = [T](repeating: vide, count: Int(taille) / MemoryLayout<T>.stride)
    guard AudioObjectGetPropertyData(objet, &adresse, 0, nil, &taille, &valeurs) == noErr else { return [] }
    return valeurs
}

func texte(_ objet: AudioObjectID, _ selecteur: AudioObjectPropertySelector) -> String {
    var adresse = AudioObjectPropertyAddress(mSelector: selecteur, mScope: kAudioObjectPropertyScopeGlobal,
                                             mElement: kAudioObjectPropertyElementMain)
    var valeur: Unmanaged<CFString>?
    var taille = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    guard AudioObjectGetPropertyData(objet, &adresse, 0, nil, &taille, &valeur) == noErr,
          let v = valeur else { return "" }
    return v.takeRetainedValue() as String
}

// Une sortie : un périphérique qui a au moins un flux en sortie.
let sorties = propriete(AudioObjectID(kAudioObjectSystemObject), kAudioHardwarePropertyDevices,
                        kAudioObjectPropertyScopeGlobal, AudioObjectID(0))
    .filter { !propriete($0, kAudioDevicePropertyStreams, kAudioObjectPropertyScopeOutput, AudioStreamID(0)).isEmpty }
    .map { (uid: texte($0, kAudioDevicePropertyDeviceUID), nom: texte($0, kAudioObjectPropertyName)) }

let args = CommandLine.arguments.dropFirst()
guard let cherche = args.first else {
    for s in sorties { print("\(s.uid)\t\(s.nom)") }
    exit(0)
}
guard let trouvee = sorties.first(where: { $0.nom == cherche }) ?? sorties.first(where: { $0.nom.contains(cherche) }) else {
    exit(1)
}
print(trouvee.uid)
