import { useState } from 'react'
import { ChevronDownIcon, PlusCircleIcon } from 'lucide-react'
import { GeneratedAvatar } from './generated-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'

import { initialProject, projects } from '@/components/shell/data'

export function ProjectSwitcher() {
  const [open, setOpen] = useState(false)
  const [currentProject, setCurrentProject] = useState(initialProject)

  const availableProjects = projects.filter(
    (project) =>
      project.workspace !== currentProject.workspace || project.name !== currentProject.name,
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="ghost" />}
        aria-label={`Switch project: ${currentProject.workspace} / ${currentProject.name}`}
        className="h-10 min-w-0 shrink gap-1 px-1 sm:ml-1 sm:gap-3 sm:px-2"
      >
        <span role="img" aria-label="Workspace avatar" className="flex shrink-0">
          <GeneratedAvatar size={24} name={currentProject.workspace} />
        </span>
        <span className="hidden min-w-0 items-center text-sm lg:flex">
          <span className="flex min-w-0 max-w-1/2 items-center gap-2">
            <span className="truncate">{currentProject.workspace}</span>
            <Badge variant="secondary">{currentProject.plan}</Badge>
          </span>
          <span className="shrink-0 px-3 text-muted-foreground">/</span>
          <span className="truncate">{currentProject.name}</span>
        </span>
        <ChevronDownIcon aria-hidden="true" className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0"
      >
        <PopoverTitle className="sr-only">Switch project</PopoverTitle>
        <Command label="Projects">
          <CommandInput aria-label="Find project" placeholder="Find project..." />
          <CommandList className="max-h-64">
            <CommandEmpty>No projects found.</CommandEmpty>
            <CommandGroup>
              {availableProjects.map((project) => (
                <CommandItem
                  key={`${project.workspace}/${project.name}`}
                  value={`${project.workspace} / ${project.name}`}
                  onSelect={() => {
                    setCurrentProject(project)
                    setOpen(false)
                  }}
                >
                  <span className="shrink-0" aria-hidden="true">
                    <GeneratedAvatar size={24} name={project.workspace} />
                  </span>
                  <span className="truncate">
                    {project.workspace} / {project.name}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="border-t p-2">
          <Button variant="ghost" className="h-10 w-full justify-start gap-3">
            <PlusCircleIcon aria-hidden="true" />
            Create project
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
