import AsyncStorage from '@react-native-async-storage/async-storage';

export type EquipmentView = 'list' | 'grid';
export const EQUIPMENT_VIEW_KEY = 'heavyar_equipment_view';

export async function loadEquipmentView(): Promise<EquipmentView> {
  try {
    return (await AsyncStorage.getItem(EQUIPMENT_VIEW_KEY)) === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
}

export async function saveEquipmentView(view: EquipmentView): Promise<void> {
  await AsyncStorage.setItem(EQUIPMENT_VIEW_KEY, view);
}