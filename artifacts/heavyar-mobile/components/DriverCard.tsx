import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { MapPin, Wrench } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDiscoveryMarkets } from '@/contexts/DiscoveryContext';
import { type DriverPublicProfile } from '@/services/workerClient';
import { formatDriverLocation, formatEquipmentCapability, getAvailabilityLabel } from '@/services/driverUtils';

const getInitials = (name?: string) => {
  if (!name) return 'D';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
};

export default function DriverCard({ driver, onPress }: { driver: DriverPublicProfile, onPress: () => void }) {
  const { isRTL } = useLanguage();
  const markets = useDiscoveryMarkets();
  const location = formatDriverLocation(driver.countryCode, driver.region, driver.city, driver.customCity, isRTL, markets);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {driver.photoUrl ? (
          <Image source={{ uri: driver.photoUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarInitials}>{getInitials(driver.displayName)}</Text>
          </View>
        )}
        <View style={[styles.info, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
          <Text style={styles.name}>{driver.displayName}</Text>
          {location ? <View style={[styles.row, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <MapPin size={14} color={Colors.textSecondary} />
            <Text style={styles.location}>{location}</Text>
          </View> : null}
        </View>
      </View>
      {driver.equipmentTypes && driver.equipmentTypes.length > 0 && (
        <View style={[styles.equipment, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Wrench size={14} color={Colors.gold} />
          <Text style={styles.equipmentText}>{driver.equipmentTypes.map(eq => formatEquipmentCapability(eq, isRTL)).join(', ')}</Text>
        </View>
      )}
      <View style={[styles.footer, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Text style={styles.experience}>{driver.yearsExperience ? `${driver.yearsExperience} ${isRTL ? 'سنوات خبرة' : 'years exp.'}` : ''}</Text>
        {driver.availabilityStatus ? <Text style={[styles.availability, driver.availabilityStatus === 'available' ? styles.availText : styles.unavailText]}>
          {getAvailabilityLabel(driver.availabilityStatus, isRTL)}
        </Text> : <View />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  header: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarFallback: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatarInitials: {
    color: Colors.gold,
    fontSize: 18,
    fontWeight: '700',
  },
  info: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  row: {
    alignItems: 'center',
    gap: 4,
  },
  location: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  equipment: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  equipmentText: {
    fontSize: 13,
    color: Colors.textPrimary,
  },
  footer: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  experience: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  availability: {
    fontSize: 13,
    fontWeight: '600',
  },
  availText: {
    color: Colors.gold,
  },
  unavailText: {
    color: Colors.textMuted,
  },
});
