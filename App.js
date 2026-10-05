import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  FlatList,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Platform,
  Alert,
  SafeAreaView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';

const DEPO_ANAHTARI = 'ilaclar_v1';
const ALARM_SAATI = 9; // bitiş günü sabah 09:00'da çalar

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function bildirimKurulum() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('ilac', {
      name: 'İlaç bitiş uyarıları',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 500, 500, 500],
    });
  }
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

async function alarmKur(ilacAdi, bitisIso) {
  const b = new Date(bitisIso);
  const zaman = new Date(b.getFullYear(), b.getMonth(), b.getDate(), ALARM_SAATI, 0, 0);
  if (zaman.getTime() <= Date.now()) return null; // geçmişe alarm kurulmaz
  return await Notifications.scheduleNotificationAsync({
    content: {
      title: 'İlaç bitiyor',
      body: `${ilacAdi} bugün bitiyor`,
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: zaman,
      channelId: 'ilac',
    },
  });
}

async function alarmIptal(alarmId) {
  if (alarmId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(alarmId);
    } catch (e) {}
  }
}

const tarihYaz = (iso) => new Date(iso).toLocaleDateString('tr-TR');

export default function App() {
  const [ilaclar, setIlaclar] = useState([]);
  const [yuklendi, setYuklendi] = useState(false);
  const [formAcik, setFormAcik] = useState(false);

  const [ad, setAd] = useState('');
  const [foto, setFoto] = useState(null);
  const [alim, setAlim] = useState(new Date());
  const [bitis, setBitis] = useState(new Date());
  const [picker, setPicker] = useState(null); // 'alim' | 'bitis' | null

  useEffect(() => {
    (async () => {
      await bildirimKurulum();
      const kayit = await AsyncStorage.getItem(DEPO_ANAHTARI);
      if (kayit) setIlaclar(JSON.parse(kayit));
      setYuklendi(true);
    })();
  }, []);

  useEffect(() => {
    if (yuklendi) AsyncStorage.setItem(DEPO_ANAHTARI, JSON.stringify(ilaclar));
  }, [ilaclar, yuklendi]);

  const formuSifirla = () => {
    setAd('');
    setFoto(null);
    setAlim(new Date());
    setBitis(new Date());
    setPicker(null);
  };

  const fotoSec = async (kamera) => {
    const izin = kamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!izin.granted) {
      Alert.alert('İzin gerekli', 'Fotoğraf için izin vermelisin.');
      return;
    }
    const sonuc = kamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.5 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.5 });
    if (!sonuc.canceled) setFoto(sonuc.assets[0].uri);
  };

  const kaydet = async () => {
    if (!ad.trim()) {
      Alert.alert('Eksik bilgi', 'İlaç adını yaz.');
      return;
    }
    if (bitis < alim) {
      Alert.alert('Tarih hatası', 'Bitiş tarihi alım tarihinden önce olamaz.');
      return;
    }
    const bitisIso = bitis.toISOString();
    const alarmId = await alarmKur(ad.trim(), bitisIso);
    if (!alarmId) {
      Alert.alert('Bilgi', 'Bitiş saati geçmişte kaldığı için alarm kurulmadı.');
    }
    const yeni = {
      id: Date.now().toString(),
      ad: ad.trim(),
      foto,
      alim: alim.toISOString(),
      bitis: bitisIso,
      alarmId,
    };
    setIlaclar((onceki) => [yeni, ...onceki]);
    formuSifirla();
    setFormAcik(false);
  };

  const sil = (ilac) => {
    Alert.alert('Sil', `${ilac.ad} silinsin mi?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          await alarmIptal(ilac.alarmId);
          setIlaclar((onceki) => onceki.filter((i) => i.id !== ilac.id));
        },
      },
    ]);
  };

  const kalanGun = (iso) => {
    const b = new Date(iso);
    const bugun = new Date();
    b.setHours(0, 0, 0, 0);
    bugun.setHours(0, 0, 0, 0);
    return Math.round((b - bugun) / 86400000);
  };

  const kartCiz = ({ item }) => {
    const kalan = kalanGun(item.bitis);
    const renk = kalan < 0 ? '#c62828' : kalan <= 7 ? '#ef6c00' : '#2e7d32';
    const etiket =
      kalan < 0 ? 'Süresi doldu' : kalan === 0 ? 'Bugün bitiyor' : `${kalan} gün kaldı`;
    return (
      <View style={s.kart}>
        {item.foto ? (
          <Image source={{ uri: item.foto }} style={s.foto} />
        ) : (
          <View style={[s.foto, s.fotoYok]}>
            <Text style={{ fontSize: 28 }}>💊</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.kartBaslik}>{item.ad}</Text>
          <Text style={s.kartSatir}>Alım: {tarihYaz(item.alim)}</Text>
          <Text style={s.kartSatir}>Bitiş: {tarihYaz(item.bitis)}</Text>
          <Text style={[s.etiket, { color: renk }]}>{etiket}</Text>
        </View>
        <TouchableOpacity onPress={() => sil(item)} style={s.silDugme}>
          <Text style={{ fontSize: 20 }}>🗑️</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.ekran}>
      <Text style={s.baslik}>İlaçlarım</Text>

      <FlatList
        data={ilaclar}
        keyExtractor={(i) => i.id}
        renderItem={kartCiz}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ListEmptyComponent={
          <Text style={s.bos}>Henüz ilaç yok. Sağ alttaki + ile ekle.</Text>
        }
      />

      <TouchableOpacity style={s.ekle} onPress={() => setFormAcik(true)}>
        <Text style={s.ekleYazi}>+</Text>
      </TouchableOpacity>

      <Modal visible={formAcik} animationType="slide" onRequestClose={() => setFormAcik(false)}>
        <SafeAreaView style={s.ekran}>
          <View style={{ padding: 16 }}>
            <Text style={s.baslik}>Yeni ilaç</Text>

            <TextInput
              style={s.girdi}
              placeholder="İlaç adı"
              value={ad}
              onChangeText={setAd}
            />

            <View style={s.fotoSatir}>
              {foto ? (
                <Image source={{ uri: foto }} style={s.foto} />
              ) : (
                <View style={[s.foto, s.fotoYok]}>
                  <Text style={{ fontSize: 28 }}>💊</Text>
                </View>
              )}
              <TouchableOpacity style={s.ikincil} onPress={() => fotoSec(true)}>
                <Text>Kamera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.ikincil} onPress={() => fotoSec(false)}>
                <Text>Galeri</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={s.tarihDugme} onPress={() => setPicker('alim')}>
              <Text>Alım tarihi: {alim.toLocaleDateString('tr-TR')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.tarihDugme} onPress={() => setPicker('bitis')}>
              <Text>Bitiş tarihi: {bitis.toLocaleDateString('tr-TR')}</Text>
            </TouchableOpacity>
            <Text style={s.not}>Alarm, bitiş günü sabah {ALARM_SAATI}:00'da çalar.</Text>

            {picker && (
              <DateTimePicker
                value={picker === 'alim' ? alim : bitis}
                mode="date"
                onChange={(e, secilen) => {
                  const hangisi = picker;
                  setPicker(null);
                  if (e.type === 'dismissed' || !secilen) return;
                  if (hangisi === 'alim') setAlim(secilen);
                  else setBitis(secilen);
                }}
              />
            )}

            <View style={{ flexDirection: 'row', marginTop: 20 }}>
              <TouchableOpacity
                style={[s.ikincil, { flex: 1 }]}
                onPress={() => {
                  formuSifirla();
                  setFormAcik(false);
                }}
              >
                <Text>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.birincil, { flex: 1 }]} onPress={kaydet}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  ekran: { flex: 1, backgroundColor: '#f5f7fa' },
  baslik: { fontSize: 26, fontWeight: '700', padding: 16, paddingBottom: 4 },
  bos: { textAlign: 'center', marginTop: 60, color: '#777' },
  kart: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    elevation: 2,
  },
  foto: { width: 72, height: 72, borderRadius: 10, marginRight: 12 },
  fotoYok: { backgroundColor: '#e8edf3', alignItems: 'center', justifyContent: 'center' },
  kartBaslik: { fontSize: 18, fontWeight: '600', marginBottom: 2 },
  kartSatir: { color: '#555' },
  etiket: { marginTop: 4, fontWeight: '600' },
  silDugme: { padding: 8 },
  ekle: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1565c0',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
  },
  ekleYazi: { color: '#fff', fontSize: 32, marginTop: -2 },
  girdi: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#d8dee6',
  },
  fotoSatir: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  tarihDugme: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#d8dee6',
  },
  not: { color: '#777', marginTop: 4 },
  ikincil: {
    backgroundColor: '#e8edf3',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginRight: 10,
  },
  birincil: {
    backgroundColor: '#1565c0',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
});
