/**
 * Plays a system sound on iOS by ID.
 * 
 * @param {number} soundId - The ID of the system sound to play.
 */
function playSystemSound(soundId) {
    var AudioServicesPlaySystemSound = new NativeFunction(
        Module.findGlobalExportByName('AudioServicesPlaySystemSound'),
        'void',
        ['uint32']
    );
    AudioServicesPlaySystemSound(soundId);
    console.log("Played system sound " + soundId);
}

 // Plays the "new mail" sound
 playSystemSound(1007);
 
