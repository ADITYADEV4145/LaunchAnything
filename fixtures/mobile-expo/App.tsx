import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
export default function App() {
  const [note, setNote] = useState('');
  return <View><Text>Trailnote</Text><Text>Today's trail</Text>
    <TextInput accessibilityLabel="Trail note" value={note} onChangeText={setNote} />
    <Text>{note.length} characters in your note</Text></View>;
}
