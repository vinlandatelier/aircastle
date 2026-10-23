import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import type { SidebarNavGroup } from '@/components/app-shared'
import { ChevronRightIcon } from 'lucide-react'

export function NavGroup({ label, items }: SidebarNavGroup) {
  return (
    <SidebarGroup>
      {label && <SidebarGroupLabel className="mb-2">{label}</SidebarGroupLabel>}
      <SidebarMenu>
        {items.map((item) => (
          <Collapsible
            render={<SidebarMenuItem />}
            className="group/collapsible"
            defaultOpen={!!item.isActive || item.subItems?.some((i) => !!i.isActive)}
            key={item.title}
          >
            {item.subItems?.length ? (
              <>
                <CollapsibleTrigger render={<SidebarMenuButton isActive={item.isActive} />}>
                  {item.icon}
                  <span>{item.title}</span>
                  <ChevronRightIcon
                    aria-hidden="true"
                    className="ms-auto transition-transform duration-200 group-data-[open]/collapsible:rotate-90"
                  />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.subItems.map((subItem) => (
                      <SidebarMenuSubItem key={subItem.title}>
                        <SidebarMenuSubButton
                          render={<a href={subItem.path} />}
                          isActive={subItem.isActive}
                        >
                          {subItem.icon}
                          <span>{subItem.title}</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </>
            ) : (
              <SidebarMenuButton
                render={<a href={item.path} />}
                isActive={item.isActive}
                tooltip={item.title}
              >
                {item.icon}
                <span>{item.title}</span>
              </SidebarMenuButton>
            )}
          </Collapsible>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
